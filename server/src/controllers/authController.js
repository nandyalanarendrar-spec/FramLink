import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import User from '../models/User.js';
import FarmerProfile from '../models/FarmerProfile.js';
import { AppError, asyncHandler } from '../utils/AppError.js';
import { mailConfigured, sendCodeEmail, sendSecurityNotice } from '../utils/mailer.js';
import { vehicleNumberSchema } from '../utils/validators.js';

const OTP_TTL_MS = 10 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;
const MAX_OTP_ATTEMPTS = 5;
const RESET_TTL_MS = 15 * 60 * 1000;

const phone = z.string().regex(/^[6-9]\d{9}$/, 'Enter a valid 10-digit Indian mobile number');
const password = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(72, 'Password is too long')
  .regex(/[A-Za-z]/, 'Password must include a letter')
  .regex(/[0-9]/, 'Password must include a number');

const registerSchema = z
  .object({
    name: z.string().min(2),
    phone,
    email: z.string().email('Enter a valid email address'),
    password,
    // admin accounts are never self-registered
    role: z.enum(['farmer', 'buyer', 'transporter']),
    // farmer
    district: z.string().min(2).optional(),
    village: z.string().min(2).optional(),
    // buyer
    buyerType: z.enum(['retailer', 'wholesaler', 'consumer']).optional(),
    businessName: z.string().max(100).optional(),
    // transporter
    vehicleType: z.string().min(2).optional(),
    vehicleNumber: vehicleNumberSchema.optional(),
    vehicleCapacityKg: z.coerce.number().positive().optional(),
  })
  .superRefine((d, ctx) => {
    const need = (cond, path, message) => cond || ctx.addIssue({ code: 'custom', path: [path], message });
    if (d.role === 'farmer') {
      need(d.district, 'district', 'District is required for farmers');
      need(d.village, 'village', 'Village is required for farmers');
    }
    if (d.role === 'buyer') need(d.buyerType, 'buyerType', 'Select buyer type');
    if (d.role === 'transporter') {
      need(d.vehicleType, 'vehicleType', 'Vehicle type is required');
      need(d.vehicleNumber, 'vehicleNumber', 'Vehicle number is required');
      need(d.vehicleCapacityKg, 'vehicleCapacityKg', 'Vehicle capacity is required');
    }
  });

const loginSchema = z.object({
  identifier: z.string().trim().min(3), // phone or email
  password: z.string().min(1),
});

const cookieOptions = () => ({
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
  maxAge: 7 * 24 * 60 * 60 * 1000,
});

const publicUser = (u) => ({
  id: u._id,
  name: u.name,
  phone: u.phone,
  email: u.email,
  role: u.role,
  emailVerified: u.emailVerified,
  verificationStatus: u.verificationStatus,
  rejectionReason: u.rejectionReason,
  detailsSubmitted: Boolean(u.detailsSubmittedAt),
});

function sendToken(res, user, status = 200, extra = {}) {
  const token = jwt.sign({ id: user._id, role: user.role, pv: user.passwordChangedAt?.getTime() ?? 0 }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });
  res.cookie('token', token, cookieOptions());
  res.status(status).json({ user: publicUser(user), ...extra });
}

const hashOtp = (otp) => crypto.createHmac('sha256', process.env.JWT_SECRET).update(otp).digest('hex');

// A failing mail service (wrong key, provider down) must not break sign-up or reveal who has an account.
// Returns true if the email went out, false if it did not (logged on the server).
async function deliver(send) {
  try {
    await send();
    return true;
  } catch (err) {
    console.error('[mail] send failed:', err.message);
    return false;
  }
}

// Generates a fresh OTP, stores only its hash, and emails it.
// Returns { devOtp } only when SMTP is not configured (local development).
async function issueOtp(user) {
  const otp = String(crypto.randomInt(100000, 1000000));
  user.emailOtp = { hash: hashOtp(otp), expiresAt: new Date(Date.now() + OTP_TTL_MS), attempts: 0, lastSentAt: new Date() };
  await user.save();
  const emailSent = await deliver(() => sendCodeEmail(user.email, user.name, otp, 'verify'));
  return { ...devCode(otp), emailSent };
}

// The code is handed back only while developing without SMTP, never in production
const devCode = (code) => (!mailConfigured() && process.env.NODE_ENV !== 'production' ? { devOtp: code } : {});
const newCode = () => String(crypto.randomInt(100000, 1000000));
const codeMatches = (code, hash) => {
  const a = Buffer.from(hashOtp(code));
  const b = Buffer.from(hash);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

export const register = asyncHandler(async (req, res) => {
  const data = registerSchema.parse(req.body);
  const user = await User.create({
    name: data.name,
    phone: data.phone,
    email: data.email,
    role: data.role,
    passwordHash: await User.hashPassword(data.password),
    ...(data.role === 'buyer' && { buyerType: data.buyerType, businessName: data.businessName || undefined }),
    ...(data.role === 'transporter' && {
      vehicleType: data.vehicleType,
      vehicleNumber: data.vehicleNumber,
      vehicleCapacityKg: data.vehicleCapacityKg,
    }),
  });

  if (data.role === 'farmer') {
    await FarmerProfile.create({ user: user._id, district: data.district, village: data.village });
  }
  const extra = await issueOtp(user);
  sendToken(res, user, 201, extra);
});

export const login = asyncHandler(async (req, res) => {
  const { identifier, password: pw } = loginSchema.parse(req.body);
  const query = identifier.includes('@') ? { email: identifier.toLowerCase() } : { phone: identifier };
  const user = await User.findOne(query).select('+passwordHash');
  // same message for both cases so attackers can't tell which accounts exist
  if (!user || !(await user.verifyPassword(pw))) throw new AppError('Invalid credentials', 401);
  if (!user.isActive) throw new AppError('Account disabled', 403);
  sendToken(res, user);
});

// Logged-in users change their own password; the current one must be right and the new one must follow the same rules
export const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = z.object({ currentPassword: z.string().min(1), newPassword: password }).parse(req.body);
  const user = await User.findById(req.user._id).select('+passwordHash');
  if (!(await user.verifyPassword(currentPassword))) throw new AppError('Your current password is wrong', 400);
  if (currentPassword === newPassword) throw new AppError('Choose a password different from the current one', 400);
  user.passwordHash = await User.hashPassword(newPassword);
  user.passwordChangedAt = new Date(); // every other device is signed out; this one gets a fresh login below
  await user.save();
  sendToken(res, user, 200, { message: 'Password changed' });
});

// ---- Forgot password: a 6-digit code by email

const GENERIC_FORGOT = 'If that email is registered, a code has been sent to it.';

// Same answer whether or not the email exists, so nobody can use this to find out who has an account
export const forgotPassword = asyncHandler(async (req, res) => {
  const { email } = z.object({ email: z.string().trim().toLowerCase().email('Enter a valid email address') }).parse(req.body);
  const user = await User.findOne({ email, isActive: true }).select('+passwordReset');
  let extra = {};
  const last = user?.passwordReset?.lastSentAt?.getTime() ?? 0;
  if (user && Date.now() - last >= RESEND_COOLDOWN_MS) {
    const code = newCode();
    user.passwordReset = { hash: hashOtp(code), expiresAt: new Date(Date.now() + RESET_TTL_MS), attempts: 0, lastSentAt: new Date() };
    await user.save();
    await deliver(() => sendCodeEmail(user.email, user.name, code, 'reset')); // the answer is the same whether or not it was sent
    extra = devCode(code);
  }
  res.json({ message: GENERIC_FORGOT, ...extra });
});

export const resetPassword = asyncHandler(async (req, res) => {
  const data = z
    .object({
      email: z.string().trim().toLowerCase().email('Enter a valid email address'),
      code: z.string().regex(/^\d{6}$/, 'Enter the 6-digit code'),
      newPassword: password,
    })
    .parse(req.body);
  const user = await User.findOne({ email: data.email, isActive: true }).select('+passwordReset +passwordHash');
  const rec = user?.passwordReset;
  // an unknown email and a wrong code get the same answer
  if (!user || !rec?.hash || rec.expiresAt < new Date()) throw new AppError('That code is wrong or has expired. Ask for a new one.', 400);
  if (rec.attempts >= MAX_OTP_ATTEMPTS) throw new AppError('Too many wrong attempts. Please request a new code.', 429);
  if (!codeMatches(data.code, rec.hash)) {
    user.passwordReset.attempts += 1;
    await user.save();
    throw new AppError('That code is wrong or has expired. Ask for a new one.', 400);
  }

  user.passwordHash = await User.hashPassword(data.newPassword);
  user.passwordChangedAt = new Date(); // signs out every device
  user.passwordReset = undefined;
  user.emailVerified = true; // they just proved they control this inbox
  await user.save();
  res.json({ message: 'Password changed. You can log in with the new password.' });
});

// ---- Change email: a code goes to the NEW address, the old one gets a security notice

export const requestEmailChange = asyncHandler(async (req, res) => {
  const { newEmail, password: pw } = z.object({ newEmail: z.string().trim().toLowerCase().email('Enter a valid email address'), password: z.string().min(1) }).parse(req.body);
  const user = await User.findById(req.user._id).select('+passwordHash +pendingEmail');
  if (!(await user.verifyPassword(pw))) throw new AppError('Your current password is wrong', 400);
  if (newEmail === user.email) throw new AppError('That is already your email', 400);
  if (await User.exists({ email: newEmail, _id: { $ne: user._id } })) throw new AppError('That email is already registered', 409);

  const wait = RESEND_COOLDOWN_MS - (Date.now() - (user.pendingEmail?.lastSentAt?.getTime() ?? 0));
  if (wait > 0) throw new AppError(`Please wait ${Math.ceil(wait / 1000)}s before requesting another code`, 429);

  const code = newCode();
  user.pendingEmail = { email: newEmail, hash: hashOtp(code), expiresAt: new Date(Date.now() + OTP_TTL_MS), attempts: 0, lastSentAt: new Date() };
  await user.save();
  const emailSent = await deliver(() => sendCodeEmail(newEmail, user.name, code, 'email-change'));
  res.json({ message: emailSent ? 'Verification code sent' : 'We could not send the email right now. Try again in a minute.', email: newEmail, emailSent, ...devCode(code) });
});

export const confirmEmailChange = asyncHandler(async (req, res) => {
  const { code } = z.object({ code: z.string().regex(/^\d{6}$/, 'Enter the 6-digit code') }).parse(req.body);
  const user = await User.findById(req.user._id).select('+pendingEmail');
  const rec = user.pendingEmail;
  if (!rec?.hash || rec.expiresAt < new Date()) throw new AppError('Code expired. Please request a new one.', 400);
  if (rec.attempts >= MAX_OTP_ATTEMPTS) throw new AppError('Too many wrong attempts. Please request a new code.', 429);
  if (!codeMatches(code, rec.hash)) {
    user.pendingEmail.attempts += 1;
    await user.save();
    throw new AppError('Incorrect code', 400);
  }

  const oldEmail = user.email;
  user.email = rec.email;
  user.emailVerified = true;
  user.pendingEmail = undefined;
  try {
    await user.save();
  } catch (err) {
    if (err.code === 11000) throw new AppError('That email is already registered', 409);
    throw err;
  }
  deliver(() => sendSecurityNotice(oldEmail, user.name, `The email on your FarmLink account was changed to ${user.email}.`));
  res.json({ user: publicUser(user) });
});

export const verifyEmail = asyncHandler(async (req, res) => {
  const { otp } = z.object({ otp: z.string().regex(/^\d{6}$/, 'Enter the 6-digit code') }).parse(req.body);
  const user = await User.findById(req.user._id).select('+emailOtp');
  if (user.emailVerified) return res.json({ user: publicUser(user) });

  const rec = user.emailOtp;
  if (!rec?.hash || rec.expiresAt < new Date()) throw new AppError('Code expired. Please request a new one.', 400);
  if (rec.attempts >= MAX_OTP_ATTEMPTS) throw new AppError('Too many wrong attempts. Please request a new code.', 429);

  const ok = crypto.timingSafeEqual(Buffer.from(hashOtp(otp)), Buffer.from(rec.hash));
  if (!ok) {
    user.emailOtp.attempts += 1;
    await user.save();
    throw new AppError('Incorrect code', 400);
  }

  user.emailVerified = true;
  user.emailOtp = undefined;
  await user.save();
  res.json({ user: publicUser(user) });
});

export const resendOtp = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id).select('+emailOtp');
  if (user.emailVerified) throw new AppError('Email already verified', 400);

  const last = user.emailOtp?.lastSentAt?.getTime() ?? 0;
  const wait = RESEND_COOLDOWN_MS - (Date.now() - last);
  if (wait > 0) throw new AppError(`Please wait ${Math.ceil(wait / 1000)}s before requesting another code`, 429);

  const extra = await issueOtp(user);
  res.json({ message: 'Verification code sent', ...extra });
});

export const logout = (_req, res) => {
  res.clearCookie('token', { ...cookieOptions(), maxAge: undefined });
  res.json({ message: 'Logged out' });
};

export const me = (req, res) => res.json({ user: publicUser(req.user) });
