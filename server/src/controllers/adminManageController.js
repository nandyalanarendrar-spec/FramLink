import { z } from 'zod';
import User from '../models/User.js';
import CropListing, { STATUSES } from '../models/CropListing.js';
import PurchaseRequest from '../models/PurchaseRequest.js';
import { AppError, asyncHandler } from '../utils/AppError.js';
import { notify, notifyMany } from '../services/notify.js';

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const PAGE = 20;

const page = (q) => Math.max(1, Number.parseInt(q.page, 10) || 1);

// ---- All accounts: search, filter, switch off / on

export const accounts = asyncHandler(async (req, res) => {
  const q = z
    .object({
      role: z.enum(['farmer', 'buyer', 'transporter', 'admin']).optional(),
      status: z.enum(['pending', 'verified', 'rejected']).optional(),
      active: z.enum(['true', 'false']).optional(),
      q: z.string().trim().max(60).optional(),
    })
    .parse(req.query);

  const filter = {};
  if (q.role) filter.role = q.role;
  if (q.status) filter.verificationStatus = q.status;
  if (q.active) filter.isActive = q.active === 'true';
  if (q.q) {
    const re = { $regex: escapeRegex(q.q), $options: 'i' };
    filter.$or = [{ name: re }, { email: re }, { phone: re }];
  }

  const p = page(req.query);
  const [users, total] = await Promise.all([
    User.find(filter, 'name phone email role isActive emailVerified verificationStatus createdAt documents').sort({ createdAt: -1 }).skip((p - 1) * PAGE).limit(PAGE).lean(),
    User.countDocuments(filter),
  ]);
  res.json({
    users: users.map(({ documents, ...u }) => ({ ...u, documentCount: documents?.length ?? 0 })),
    total,
    page: p,
    pages: Math.max(1, Math.ceil(total / PAGE)),
  });
});

// A switched-off account cannot log in and its existing session stops working. Admins cannot be switched off here.
export const setActive = asyncHandler(async (req, res) => {
  const { isActive } = z.object({ isActive: z.boolean() }).parse(req.body);
  const user = await User.findOneAndUpdate({ _id: req.params.id, role: { $ne: 'admin' } }, { isActive }, { new: true, projection: 'name role isActive' });
  if (!user) throw new AppError('Account not found', 404);
  res.json({ id: user._id, isActive: user.isActive });
});

// ---- All crop listings: review and take down

export const listings = asyncHandler(async (req, res) => {
  const q = z.object({ status: z.enum(STATUSES).optional(), q: z.string().trim().max(60).optional() }).parse(req.query);
  const filter = {};
  if (q.status) filter.status = q.status;
  if (q.q) filter.crop = { $regex: escapeRegex(q.q), $options: 'i' };

  const p = page(req.query);
  const [rows, total] = await Promise.all([
    CropListing.find(filter).populate('farmer', 'name phone').sort({ createdAt: -1 }).skip((p - 1) * PAGE).limit(PAGE).lean(),
    CropListing.countDocuments(filter),
  ]);
  res.json({ listings: rows, total, page: p, pages: Math.max(1, Math.ceil(total / PAGE)) });
});

// Removes a live listing (policy breach, wrong data...). Open purchase requests on it are closed and buyers are told.
export const takeDown = asyncHandler(async (req, res) => {
  const { reason } = z.object({ reason: z.string().trim().min(3, 'Give a reason').max(300) }).parse(req.body);
  const listing = await CropListing.findOneAndUpdate(
    { _id: req.params.id, status: { $in: ['active', 'partially_sold', 'paused', 'draft'] } },
    { status: 'withdrawn' },
    { new: true }
  );
  if (!listing) throw new AppError('Only draft, live or paused listings can be taken down', 409);

  const open = await PurchaseRequest.find({ listing: listing._id, isOpen: true }, 'buyer');
  await PurchaseRequest.updateMany(
    { listing: listing._id, isOpen: true },
    {
      $set: { status: 'cancelled', isOpen: false },
      $unset: { turn: '' },
      $push: { history: { by: 'farmer', action: 'cancel', message: 'Listing removed by FarmLink admin', at: new Date() } },
    }
  );
  await notify(listing.farmer, { type: 'listing', title: 'Your listing was removed', message: `${listing.crop} was removed by an admin. Reason: ${reason}`, link: '/farmer/crops' });
  await notifyMany(open.map((r) => r.buyer), { type: 'request', title: 'Request closed', message: `The ${listing.crop} listing was removed by an admin, so your request was closed.`, link: '/buyer/requests' });
  res.json({ id: listing._id, status: listing.status, closedRequests: open.length });
});
