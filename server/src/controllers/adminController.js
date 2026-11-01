import { z } from 'zod';
import User from '../models/User.js';
import FarmerProfile from '../models/FarmerProfile.js';
import { AppError, asyncHandler } from '../utils/AppError.js';
import { notify } from '../services/notify.js';
import Report from '../models/Report.js';

const listQuery = z.object({
  status: z.enum(['pending', 'verified', 'rejected']).default('pending'),
  role: z.enum(['farmer', 'buyer', 'transporter']).optional(),
});

// Users waiting for review. Only email-verified accounts that submitted details reach the queue.
export const listUsers = asyncHandler(async (req, res) => {
  const { status, role } = listQuery.parse(req.query);
  const filter = { role: role ?? { $ne: 'admin' }, verificationStatus: status, emailVerified: true };
  // pending accounts appear only after they have submitted their verification details
  if (status === 'pending') filter.detailsSubmittedAt = { $exists: true };
  const users = await User.find(filter).sort({ createdAt: 1 }).lean();

  const profiles = await FarmerProfile.find({ user: { $in: users.map((u) => u._id) } }).lean();
  const byUser = new Map(profiles.map((p) => [String(p.user), p]));

  res.json({
    users: users.map(({ passwordHash, emailOtp, documents, ...u }) => ({
      ...u,
      documents: (documents ?? []).map((d) => ({ id: d._id, name: d.name, mime: d.mime })),
      farmerProfile: byUser.get(String(u._id)) || null,
    })),
  });
});

export const stats = asyncHandler(async (_req, res) => {
  const rows = await User.aggregate([
    { $match: { role: { $ne: 'admin' }, emailVerified: true, $or: [{ verificationStatus: { $ne: 'pending' } }, { detailsSubmittedAt: { $exists: true } }] } },
    { $group: { _id: { role: '$role', status: '$verificationStatus' }, count: { $sum: 1 } } },
  ]);
  res.json({ rows: rows.map((r) => ({ role: r._id.role, status: r._id.status, count: r.count })), openReports: await Report.countDocuments({ status: 'open' }) });
});

async function review(id, update) {
  const user = await User.findOneAndUpdate({ _id: id, role: { $ne: 'admin' } }, update, { new: true });
  if (!user) throw new AppError('User not found', 404);
  return user;
}

export const verifyUser = asyncHandler(async (req, res) => {
  const user = await review(req.params.id, {
    verificationStatus: 'verified',
    verifiedAt: new Date(),
    $unset: { rejectionReason: '' },
  });
  await notify(user._id, { type: 'verification', title: 'Account verified', message: 'Your account is verified. You can now use all FarmLink features.', link: `/${user.role}` });
  res.json({ id: user._id, verificationStatus: user.verificationStatus });
});

export const rejectUser = asyncHandler(async (req, res) => {
  const { reason } = z.object({ reason: z.string().min(3, 'Please give a reason').max(300) }).parse(req.body);
  const user = await review(req.params.id, { verificationStatus: 'rejected', rejectionReason: reason });
  await notify(user._id, { type: 'verification', title: 'Verification rejected', message: `Reason: ${reason}. Update your details and submit again.`, link: `/${user.role}/profile` });
  res.json({ id: user._id, verificationStatus: user.verificationStatus });
});
