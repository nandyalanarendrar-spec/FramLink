import { z } from 'zod';
import User from '../models/User.js';
import FarmerProfile from '../models/FarmerProfile.js';
import { AppError, asyncHandler } from '../utils/AppError.js';
import { notifyAdmins } from '../services/notify.js';
import { idNumberSchema, vehicleNumberSchema } from '../utils/validators.js';
import { DOC_DIR, removeFile, saveUpload } from '../utils/files.js';

const MAX_DOCS = 5;

const idProof = {
  idType: z.enum(['farmer_id', 'voter_id', 'pan', 'driving_licence']),
  idNumber: idNumberSchema,
};

// What each role must submit before an admin can verify them
const schemas = {
  farmer: z.object({
    ...idProof,
    farmSizeAcres: z.coerce.number().positive('Farm size must be greater than 0').max(10000),
    farmAddress: z.string().trim().min(5, 'Enter your farm address').max(200),
    landSurveyNumber: z.string().trim().max(40).optional(),
  }),
  buyer: z.object({
    ...idProof,
    buyerType: z.enum(['retailer', 'wholesaler', 'consumer']),
    businessName: z.string().trim().max(100).optional(),
    businessAddress: z.string().trim().min(5, 'Enter your address').max(200),
    gstNumber: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/, 'Enter a valid 15-character GST number')
      .optional(),
  }),
  transporter: z.object({
    vehicleNumber: vehicleNumberSchema,
    vehicleType: z.string().trim().min(2, 'Vehicle type is required').max(40),
    vehicleCapacityKg: z.coerce.number().positive('Capacity must be greater than 0').max(100000),
    licenceNumber: idNumberSchema,
  }),
};

const FIELDS = {
  farmer: ['idType', 'idNumber', 'landSurveyNumber'],
  buyer: ['idType', 'idNumber', 'buyerType', 'businessName', 'businessAddress', 'gstNumber'],
  transporter: ['vehicleNumber', 'vehicleType', 'vehicleCapacityKg', 'licenceNumber', 'isAvailable', 'ratePerKm', 'serviceArea'],
};

const docList = (u) => (u.documents ?? []).map((d) => ({ id: d._id, name: d.name, mime: d.mime, uploadedAt: d.uploadedAt }));

async function detailsFor(user) {
  const out = {};
  FIELDS[user.role].forEach((k) => (out[k] = user[k]));
  if (user.role === 'farmer') {
    const p = await FarmerProfile.findOne({ user: user._id }).lean();
    Object.assign(out, { farmSizeAcres: p?.farmSizeAcres, farmAddress: p?.farmAddress, district: p?.district, village: p?.village });
  }
  return out;
}

// ---- Editing a profile after registration

const phoneRule = z.string().regex(/^[6-9][0-9]{9}$/, 'Enter a valid 10-digit Indian mobile number');
const accountSchema = z.object({ name: z.string().trim().min(2, 'Enter your name').max(80), phone: phoneRule });

// Name and phone can be changed any time (email needs a fresh OTP, so it is not editable here)
export const updateAccount = asyncHandler(async (req, res) => {
  const data = accountSchema.parse(req.body);
  if (await User.exists({ phone: data.phone, _id: { $ne: req.user._id } })) throw new AppError('That phone number is already registered', 409);
  await User.updateOne({ _id: req.user._id }, { $set: data });
  res.json({ account: data });
});

// Everyday details that do not prove identity, so they stay editable even after verification
const basicSchemas = {
  farmer: z.object({
    farmSizeAcres: z.coerce.number().positive('Farm size must be greater than 0').max(10000),
    farmAddress: z.string().trim().min(5, 'Enter your farm address').max(200),
    district: z.string().trim().min(2, 'Enter your district').max(60),
    village: z.string().trim().min(2, 'Enter your village').max(60),
  }),
  buyer: z.object({
    buyerType: z.enum(['retailer', 'wholesaler', 'consumer']),
    businessName: z.string().trim().max(100).optional(),
    businessAddress: z.string().trim().min(5, 'Enter your address').max(200),
  }),
};

export const updateBasic = asyncHandler(async (req, res) => {
  const role = req.user.role;
  if (!basicSchemas[role]) throw new AppError('Transporters edit their vehicle on the My Vehicles page', 400);
  const data = basicSchemas[role].parse(req.body);
  if (role === 'farmer') {
    await FarmerProfile.updateOne({ user: req.user._id }, { $set: data }, { upsert: true });
  } else {
    const { businessName, ...rest } = data;
    await User.updateOne({ _id: req.user._id }, { $set: { ...rest, ...(businessName && { businessName }) }, ...(!businessName && { $unset: { businessName: '' } }) });
  }
  res.json({ details: await detailsFor(await User.findById(req.user._id)) });
});

// ID details, GST, survey/plate/licence prove who you are, so they lock once verified. Editing them means being verified again.
export const unlockForEdit = asyncHandler(async (req, res) => {
  if (req.user.verificationStatus !== 'verified') throw new AppError('Your details are already editable', 409);
  await User.updateOne({ _id: req.user._id }, { $set: { verificationStatus: 'pending' }, $unset: { detailsSubmittedAt: '' } });
  res.json({ status: 'pending' });
});

export const getProfile = asyncHandler(async (req, res) => {
  const u = req.user;
  res.json({
    account: { name: u.name, phone: u.phone, email: u.email, role: u.role, emailVerified: u.emailVerified },
    verification: { status: u.verificationStatus, rejectionReason: u.rejectionReason, submittedAt: u.detailsSubmittedAt },
    details: await detailsFor(u),
    documents: docList(u),
  });
});

export const submitVerification = asyncHandler(async (req, res) => {
  const user = req.user;
  if (user.verificationStatus === 'verified') {
    throw new AppError('Your account is verified. Contact support to change verified details.', 403);
  }

  const data = schemas[user.role].parse(req.body);
  if (!user.documents?.length) throw new AppError('Upload a photo or PDF of your ID proof first', 400);
  const { farmSizeAcres, farmAddress, ...userFields } = data;

  await User.updateOne(
    { _id: user._id },
    { $set: { ...userFields, detailsSubmittedAt: new Date(), verificationStatus: 'pending' }, $unset: { rejectionReason: '' } }
  );
  if (user.role === 'farmer') {
    await FarmerProfile.updateOne({ user: user._id }, { $set: { farmSizeAcres, farmAddress } });
  }
  await notifyAdmins({ type: 'verification', title: 'New account to verify', message: `${user.name} (${user.role}) submitted verification details`, link: '/admin/verifications' });
  res.json({ message: 'Submitted for admin review' });
});

// ---- Verification documents (private files, owner + admin only)

const cleanLabel = (s) => String(s ?? 'document').replace(/[\\/]/g, ' ').replace(/[^\p{L}\p{N} ._()-]/gu, '').trim().slice(0, 60) || 'document';

export const addDocuments = asyncHandler(async (req, res) => {
  const user = req.user;
  // Locked once verified, unless the account was verified before documents existed and has none on file
  if (user.verificationStatus === 'verified' && user.documents?.length) throw new AppError('Your account is verified, so documents are locked', 403);
  const files = req.files ?? [];
  if (!files.length) throw new AppError('Choose at least one file', 400);
  if ((user.documents?.length ?? 0) + files.length > MAX_DOCS) throw new AppError(`You can keep up to ${MAX_DOCS} documents`, 400);

  const saved = [];
  try {
    for (const f of files) {
      const { name, mime } = await saveUpload(f.buffer, DOC_DIR, { allowPdf: true });
      saved.push({ name: cleanLabel(f.originalname), file: name, mime });
    }
  } catch (err) {
    await Promise.all(saved.map((d) => removeFile(DOC_DIR, d.file))); // all or nothing
    throw err;
  }
  await User.updateOne({ _id: user._id }, { $push: { documents: { $each: saved } } });
  const fresh = await User.findById(user._id, 'documents');
  res.status(201).json({ documents: docList(fresh) });
});

export const removeDocument = asyncHandler(async (req, res) => {
  const user = req.user;
  if (user.verificationStatus === 'verified') throw new AppError('Your account is verified, so documents are locked', 403);
  const doc = user.documents?.id(req.params.docId);
  if (!doc) throw new AppError('Document not found', 404);
  await removeFile(DOC_DIR, doc.file);
  await User.updateOne({ _id: user._id }, { $pull: { documents: { _id: doc._id } } });
  const fresh = await User.findById(user._id, 'documents');
  res.json({ documents: docList(fresh) });
});

// ---- Transporter vehicle (capacity and availability can change; the plate is locked once verified)

const vehicleSchema = z.object({
  vehicleType: z.string().trim().min(2).max(40),
  vehicleCapacityKg: z.coerce.number().positive().max(100000),
  isAvailable: z.boolean(),
  ratePerKm: z.coerce.number().positive().max(1000).nullish(),
  serviceArea: z.string().trim().max(80).nullish(),
});

export const updateVehicle = asyncHandler(async (req, res) => {
  if (req.user.role !== 'transporter') throw new AppError('Forbidden', 403);
  const data = vehicleSchema.parse(req.body);
  const { ratePerKm, serviceArea, ...rest } = data;
  const $set = { ...rest };
  const $unset = {};
  if (ratePerKm) $set.ratePerKm = ratePerKm; else $unset.ratePerKm = '';
  if (serviceArea) $set.serviceArea = serviceArea; else $unset.serviceArea = '';
  await User.updateOne({ _id: req.user._id }, { $set, $unset });
  res.json({ details: { ...(await detailsFor(await User.findById(req.user._id))) } });
});
