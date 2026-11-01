import { z } from 'zod';
import CropListing, { CATEGORIES, GRADES, STATUSES } from '../models/CropListing.js';
import FarmerProfile from '../models/FarmerProfile.js';
import { AppError, asyncHandler } from '../utils/AppError.js';
import path from 'node:path';
import { CROP_DIR, copyUpload, removeFile, saveUpload } from '../utils/files.js';

const MAX_IMAGES = 4;
const urlFor = (name) => `/uploads/crops/${path.basename(name)}`;

// What the farmer may do from each status. sold_out / expired are system-set and final.
const TRANSITIONS = {
  draft: ['active', 'withdrawn'],
  active: ['paused', 'withdrawn'],
  partially_sold: ['paused', 'withdrawn'],
  paused: ['active', 'withdrawn'],
};
const EDITABLE = ['draft', 'active', 'partially_sold', 'paused'];
const LIVE = ['active', 'partially_sold', 'paused'];

const endOfDay = (d) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 23, 59, 59, 999));
const startOfToday = () => {
  const n = new Date();
  return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()));
};

const cropSchema = z
  .object({
    crop: z.string().trim().min(2, 'Crop name is required').max(60),
    category: z.enum(CATEGORIES),
    quantity: z.coerce.number().positive('Quantity must be greater than 0').max(10_000_000),
    expectedPrice: z.coerce.number().positive('Price must be greater than 0').max(1_000_000),
    minOrderQty: z.coerce.number().positive().optional(),
    grade: z.enum(GRADES).default('B'),
    harvestDate: z.coerce.date(),
    availableFrom: z.coerce.date().optional(),
    deadline: z.coerce.date().transform(endOfDay),
    district: z.string().trim().min(2).optional(),
    village: z.string().trim().min(2).optional(),
    description: z.string().trim().max(500).optional(),
  })
  .superRefine((d, ctx) => {
    const bad = (path, message) => ctx.addIssue({ code: 'custom', path: [path], message });
    if (d.deadline < startOfToday()) bad('deadline', 'Selling deadline cannot be in the past');
    if (d.availableFrom && d.availableFrom > d.deadline) bad('availableFrom', 'Available-from must be before the deadline');
    if (d.minOrderQty && d.minOrderQty > d.quantity) bad('minOrderQty', 'Minimum order cannot exceed total quantity');
  });

const statusSchema = z.object({ status: z.enum(['active', 'paused', 'withdrawn']) });

const isVerified = (user) => user.verificationStatus === 'verified';

// Find a listing that belongs to the logged-in farmer (404 for anyone else's)
async function ownListing(req) {
  const listing = await CropListing.findOne({ _id: req.params.id, farmer: req.user._id });
  if (!listing) throw new AppError('Listing not found', 404);
  return listing;
}

// Listings past their selling deadline become expired
const expireOld = (farmer) =>
  CropListing.updateMany({ farmer, status: { $in: LIVE }, deadline: { $lt: new Date() } }, { status: 'expired' });

function assertCanActivate(user, listing) {
  if (!isVerified(user)) throw new AppError('Your account must be verified by admin before you can publish listings', 403);
  if (listing.deadline < new Date()) throw new AppError('Selling deadline has passed. Extend the deadline first.', 400);
}

export const createCrop = asyncHandler(async (req, res) => {
  const { publish = false, ...body } = req.body ?? {};
  const data = cropSchema.parse(body);

  const profile = await FarmerProfile.findOne({ user: req.user._id }).lean();
  const listing = new CropListing({
    ...data,
    district: data.district ?? profile?.district,
    village: data.village ?? profile?.village,
    farmer: req.user._id,
    availableQty: data.quantity,
    status: 'draft',
  });
  if (publish === true) {
    assertCanActivate(req.user, listing);
    listing.status = 'active';
  }
  await listing.save();
  res.status(201).json({ listing });
});

export const myCrops = asyncHandler(async (req, res) => {
  await expireOld(req.user._id);
  const status = STATUSES.includes(req.query.status) ? req.query.status : undefined;

  const [listings, grouped] = await Promise.all([
    CropListing.find({ farmer: req.user._id, ...(status && { status }) }).sort({ createdAt: -1 }),
    CropListing.aggregate([{ $match: { farmer: req.user._id } }, { $group: { _id: '$status', n: { $sum: 1 } } }]),
  ]);
  const counts = Object.fromEntries(STATUSES.map((s) => [s, 0]));
  grouped.forEach((g) => (counts[g._id] = g.n));
  res.json({ listings, counts });
});

export const getCrop = asyncHandler(async (req, res) => {
  await expireOld(req.user._id);
  res.json({ listing: await ownListing(req) });
});

export const updateCrop = asyncHandler(async (req, res) => {
  const listing = await ownListing(req);
  if (!EDITABLE.includes(listing.status)) throw new AppError(`A ${listing.status.replace('_', ' ')} listing cannot be edited`, 400);

  const data = cropSchema.parse(req.body);
  const reserved = listing.quantity - listing.availableQty; // already sold / reserved
  if (data.quantity <= reserved) throw new AppError(`Quantity must be more than the ${reserved} kg already sold or reserved`, 400);

  Object.assign(listing, data, {
    district: data.district ?? listing.district,
    village: data.village ?? listing.village,
    availableQty: data.quantity - reserved,
  });
  await listing.save();
  res.json({ listing });
});

const relistSchema = z.object({
  quantity: z.coerce.number().positive().max(10_000_000).optional(),
  expectedPrice: z.coerce.number().positive().max(1_000_000).optional(),
  harvestDate: z.coerce.date().optional(),
  deadline: z.coerce.date().optional(),
  publish: z.boolean().optional(),
});

// "Relist": a fresh listing from an old one (same crop, grade, village, description and photos), with today's date and a new deadline
export const relist = asyncHandler(async (req, res) => {
  const src = await ownListing(req);
  if (src.status === 'draft') throw new AppError('This listing is still a draft. Edit and publish it instead.', 400);
  const o = relistSchema.parse(req.body ?? {});
  const today = startOfToday();
  const quantity = o.quantity ?? src.quantity;
  const data = cropSchema.parse({
    crop: src.crop,
    category: src.category,
    quantity,
    expectedPrice: o.expectedPrice ?? src.expectedPrice,
    minOrderQty: src.minOrderQty ? Math.min(src.minOrderQty, quantity) : undefined,
    grade: src.grade,
    harvestDate: o.harvestDate ?? today,
    deadline: o.deadline ?? new Date(today.getTime() + 7 * 864e5),
    district: src.district,
    village: src.village,
    description: src.description,
  });

  const images = [];
  for (const url of src.images.slice(0, MAX_IMAGES)) {
    const name = await copyUpload(CROP_DIR, url);
    if (name) images.push(urlFor(name));
  }
  const listing = new CropListing({ ...data, farmer: req.user._id, availableQty: data.quantity, images, status: 'draft' });
  if (o.publish ?? true) {
    assertCanActivate(req.user, listing);
    listing.status = 'active';
  }
  await listing.save();
  res.status(201).json({ listing });
});

const adjustSchema = z
  .object({
    expectedPrice: z.coerce.number().positive('Price must be greater than 0').max(1_000_000).optional(),
    deadline: z.coerce.date().transform(endOfDay).optional(),
  })
  .refine((d) => d.expectedPrice || d.deadline, 'Give a new price or a new deadline');

// Quick fix for unsold stock: lower the price and/or extend the deadline without resending the whole listing
export const adjust = asyncHandler(async (req, res) => {
  const data = adjustSchema.parse(req.body ?? {});
  const listing = await ownListing(req);
  if (!LIVE.includes(listing.status)) throw new AppError(`A ${listing.status.replace('_', ' ')} listing cannot be changed. Relist it instead.`, 400);
  if (data.deadline && data.deadline < startOfToday()) throw new AppError('Selling deadline cannot be in the past', 400);
  if (data.expectedPrice) listing.expectedPrice = data.expectedPrice;
  if (data.deadline) listing.deadline = data.deadline;
  await listing.save();
  res.json({ listing });
});

export const setStatus = asyncHandler(async (req, res) => {
  const { status: target } = statusSchema.parse(req.body);
  const listing = await ownListing(req);

  if (!TRANSITIONS[listing.status]?.includes(target)) {
    throw new AppError(`Cannot change a ${listing.status.replace('_', ' ')} listing to ${target}`, 400);
  }
  if (target === 'active') {
    assertCanActivate(req.user, listing);
    // resuming a partly sold listing keeps its partially_sold state
    listing.status = listing.availableQty < listing.quantity ? 'partially_sold' : 'active';
  } else {
    listing.status = target;
  }
  await listing.save();
  res.json({ listing });
});

export const addImages = asyncHandler(async (req, res) => {
  const listing = await ownListing(req);
  if (!EDITABLE.includes(listing.status)) throw new AppError(`A ${listing.status.replace('_', ' ')} listing cannot be edited`, 400);
  const files = req.files ?? [];
  if (!files.length) throw new AppError('Choose at least one photo', 400);
  if (listing.images.length + files.length > MAX_IMAGES) throw new AppError(`A listing can have up to ${MAX_IMAGES} photos`, 400);

  const saved = [];
  try {
    for (const f of files) saved.push(urlFor((await saveUpload(f.buffer, CROP_DIR)).name));
  } catch (err) {
    await Promise.all(saved.map((u) => removeFile(CROP_DIR, u))); // all or nothing
    throw err;
  }
  listing.images.push(...saved);
  await listing.save();
  res.status(201).json({ listing });
});

export const removeImage = asyncHandler(async (req, res) => {
  const listing = await ownListing(req);
  const url = urlFor(req.params.name);
  if (!listing.images.includes(url)) throw new AppError('Photo not found', 404);
  listing.images = listing.images.filter((u) => u !== url);
  await listing.save();
  await removeFile(CROP_DIR, url);
  res.json({ listing });
});

export const deleteCrop = asyncHandler(async (req, res) => {
  const listing = await ownListing(req);
  if (listing.status !== 'draft') throw new AppError('Only drafts can be deleted. Withdraw the listing instead.', 400);
  await Promise.all(listing.images.map((u) => removeFile(CROP_DIR, u)));
  await listing.deleteOne();
  res.json({ message: 'Draft deleted' });
});
