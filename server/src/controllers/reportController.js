import { z } from 'zod';
import Report, { REPORT_CATEGORIES } from '../models/Report.js';
import Order from '../models/Order.js';
import CropListing from '../models/CropListing.js';
import { AppError, asyncHandler } from '../utils/AppError.js';
import { notify, notifyAdmins } from '../services/notify.js';

const createSchema = z.object({
  targetType: z.enum(['order', 'listing']),
  targetId: z.string().min(1),
  category: z.enum(REPORT_CATEGORIES),
  details: z.string().trim().max(500).optional(),
});

// Report a problem with an order you are part of, or with someone else's listing
export const create = asyncHandler(async (req, res) => {
  const d = createSchema.parse(req.body);
  const me = req.user._id;
  let reported;
  let summary;

  if (d.targetType === 'order') {
    const order = await Order.findOne({ _id: d.targetId, $or: [{ farmer: me }, { buyer: me }] });
    if (!order) throw new AppError('Order not found', 404);
    reported = String(order.farmer) === String(me) ? order.buyer : order.farmer;
    summary = `${order.crop}, ${order.quantity} kg`;
  } else {
    const listing = await CropListing.findOne({ _id: d.targetId, farmer: { $ne: me } });
    if (!listing) throw new AppError('Listing not found', 404);
    reported = listing.farmer;
    summary = `${listing.crop} listing`;
  }

  let report;
  try {
    report = await Report.create({ reporter: me, reported, targetType: d.targetType, target: d.targetId, summary, category: d.category, details: d.details });
  } catch (err) {
    if (err.code === 11000) throw new AppError('You already have an open report on this. An admin will review it soon.', 409);
    throw err;
  }
  await notifyAdmins({ type: 'report', title: 'New report', message: `${req.user.name} reported: ${summary} (${d.category.replace(/_/g, ' ')})`, link: '/admin/reports' });
  res.status(201).json({ report });
});

export const mine = asyncHandler(async (req, res) => {
  const filter = { reporter: req.user._id, ...(req.query.targetId && { target: String(req.query.targetId) }) };
  res.json({ reports: await Report.find(filter).sort({ createdAt: -1 }).limit(50).lean() });
});

// ---- admin

export const adminList = asyncHandler(async (req, res) => {
  const status = ['open', 'resolved', 'dismissed'].includes(req.query.status) ? req.query.status : 'open';
  const reports = await Report.find({ status })
    .populate('reporter', 'name phone role')
    .populate('reported', 'name phone role isActive')
    .sort({ createdAt: status === 'open' ? 1 : -1 })
    .limit(100)
    .lean();
  res.json({ reports });
});

export const resolve = asyncHandler(async (req, res) => {
  const { status, note } = z.object({ status: z.enum(['resolved', 'dismissed']), note: z.string().trim().min(3, 'Add a short note for the reporter').max(300) }).parse(req.body);
  const report = await Report.findOneAndUpdate({ _id: req.params.id, status: 'open' }, { status, adminNote: note, resolvedAt: new Date() }, { new: true });
  if (!report) throw new AppError('Report not found or already closed', 404);
  await notify(report.reporter, {
    type: 'report',
    title: status === 'resolved' ? 'Your report was resolved' : 'Your report was reviewed',
    message: `${report.summary}: ${note}`,
    link: null,
  });
  res.json({ report });
});
