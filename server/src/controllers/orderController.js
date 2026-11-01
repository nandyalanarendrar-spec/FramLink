import mongoose from 'mongoose';
import { z } from 'zod';
import Order, { ACTIVE_ORDER } from '../models/Order.js';
import CropListing from '../models/CropListing.js';
import TransportRequest from '../models/TransportRequest.js';
import { AppError, asyncHandler } from '../utils/AppError.js';
import { notify, inr } from '../services/notify.js';
import Rating from '../models/Rating.js';
import { ratingOf } from '../services/ratings.js';

const roleOf = (req) => req.user.role; // 'farmer' | 'buyer'
const mineFilter = (req) => (roleOf(req) === 'farmer' ? { farmer: req.user._id } : { buyer: req.user._id });

async function ownOrder(req, session) {
  const q = Order.findOne({ _id: req.params.id, ...mineFilter(req) });
  if (session) q.session(session);
  const order = await q;
  if (!order) throw new AppError('Order not found', 404);
  return order;
}

const hasLiveTransport = (orderId) => TransportRequest.exists({ order: orderId, isActive: true, status: { $in: ['accepted', 'picked_up'] } });

// Both parties already exchanged phone numbers when the request was accepted
async function shape(order, role) {
  await order.populate([
    { path: 'buyer', select: 'name phone buyerType businessName businessAddress' },
    { path: 'farmer', select: 'name phone' },
    { path: 'listing', select: 'village district' },
  ]);
  const transport = await TransportRequest.findOne({ order: order._id }).sort({ createdAt: -1 }).populate('transporter', 'name phone vehicleType vehicleNumber vehicleCapacityKg').lean();
  const counterpart =
    role === 'farmer'
      ? { name: order.buyer.name, phone: order.buyer.phone, detail: [order.buyer.buyerType, order.buyer.businessName].filter(Boolean).join(' · ') }
      : { name: order.farmer.name, phone: order.farmer.phone, detail: `${order.listing?.village}, ${order.listing?.district}` };
  const { buyer, farmer, ...rest } = order.toObject();
  counterpart.rating = await ratingOf(role === 'farmer' ? order.buyer._id : order.farmer._id);
  return { ...rest, counterpart, pickupFrom: order.listing ? { village: order.listing.village, district: order.listing.district } : undefined,
    dropTo: order.buyer.businessAddress, transport: transport ?? null };
}

export const myOrders = asyncHandler(async (req, res) => {
  const role = roleOf(req);
  const tab = req.query.tab === 'history' ? 'history' : 'active';
  const mine = mineFilter(req);
  const filter = { ...mine, status: tab === 'active' ? { $in: ACTIVE_ORDER } : { $in: ['completed', 'cancelled'] } };

  const [docs, grouped] = await Promise.all([
    Order.find(filter).sort({ updatedAt: -1 }),
    Order.aggregate([{ $match: mine }, { $group: { _id: '$status', n: { $sum: 1 } } }]),
  ]);
  const by = Object.fromEntries(grouped.map((g) => [g._id, g.n]));
  const counts = { active: ACTIVE_ORDER.reduce((s, k) => s + (by[k] ?? 0), 0), history: (by.completed ?? 0) + (by.cancelled ?? 0) };
  res.json({ orders: await Promise.all(docs.map((d) => shape(d, role))), counts });
});

// Totals for the history page: sales (farmer) or purchases (buyer), completed orders only
export const summary = asyncHandler(async (req, res) => {
  const match = { ...mineFilter(req), status: 'completed' };
  const [totals] = await Order.aggregate([{ $match: match }, { $group: { _id: null, orders: { $sum: 1 }, quantity: { $sum: '$quantity' }, value: { $sum: '$total' } } }]);
  const byCrop = await Order.aggregate([
    { $match: match },
    { $group: { _id: '$crop', quantity: { $sum: '$quantity' }, value: { $sum: '$total' } } },
    { $sort: { value: -1 } },
    { $limit: 5 },
  ]);
  const byMonth = await Order.aggregate([
    { $match: match },
    { $group: { _id: { $dateToString: { format: '%Y-%m', date: '$updatedAt' } }, value: { $sum: '$total' } } },
    { $sort: { _id: -1 } },
    { $limit: 6 },
  ]);
  const unpaid = await Order.aggregate([
    { $match: { ...mineFilter(req), status: { $in: [...ACTIVE_ORDER, 'completed'] }, paymentStatus: 'pending' } },
    { $group: { _id: null, value: { $sum: '$total' }, n: { $sum: 1 } } },
  ]);
  res.json({
    orders: totals?.orders ?? 0,
    quantity: totals?.quantity ?? 0,
    value: totals?.value ?? 0,
    byCrop: byCrop.map((c) => ({ crop: c._id, quantity: c.quantity, value: c.value })),
    byMonth: byMonth.map((m) => ({ month: m._id, value: m.value })).reverse(),
    unpaid: { value: unpaid[0]?.value ?? 0, orders: unpaid[0]?.n ?? 0 },
  });
});

export const getOrder = asyncHandler(async (req, res) => {
  res.json({ order: await shape(await ownOrder(req), roleOf(req)) });
});

// Farmer moves the order along. If a transporter is assigned, pickup/delivery are theirs to mark.
const FARMER_STEPS = { ready_for_pickup: 'confirmed', in_transit: 'ready_for_pickup', delivered: 'in_transit' };
export const advance = asyncHandler(async (req, res) => {
  const { status } = z.object({ status: z.enum(['ready_for_pickup', 'in_transit', 'delivered']) }).parse(req.body);
  const order = await ownOrder(req);
  if (roleOf(req) !== 'farmer') throw new AppError('Forbidden', 403);
  if (order.status !== FARMER_STEPS[status]) throw new AppError(`Cannot move a ${order.status.replace('_', ' ')} order to ${status.replace('_', ' ')}`, 409);
  if (status !== 'ready_for_pickup' && (await hasLiveTransport(order._id))) {
    throw new AppError('The assigned transporter marks pickup and delivery', 409);
  }

  const updated = await Order.findOneAndUpdate(
    { _id: order._id, status: order.status },
    { $set: { status }, $push: { timeline: { status, by: 'farmer', at: new Date() } } },
    { new: true }
  );
  if (!updated) throw new AppError('This order was just updated. Refresh and try again.', 409);
  const label = { ready_for_pickup: 'is ready for pickup', in_transit: 'is on its way', delivered: 'has been delivered. Please confirm receipt' }[status];
  await notify(updated.buyer, { type: 'order', title: 'Order update', message: `Your order of ${updated.crop} ${label}`, link: `/buyer/orders/${updated._id}` });
  res.json({ order: await shape(updated, 'farmer') });
});

export const markPaid = asyncHandler(async (req, res) => {
  const order = await ownOrder(req);
  if (roleOf(req) !== 'farmer') throw new AppError('Only the farmer can record payment received', 403);
  if (order.status === 'cancelled') throw new AppError('This order is cancelled', 409);
  if (order.paymentStatus === 'paid') return res.json({ order: await shape(order, 'farmer') });
  order.paymentStatus = 'paid';
  order.paidAt = new Date();
  await order.save();
  await notify(order.buyer, { type: 'order', title: 'Payment recorded', message: `The farmer recorded your payment of ${inr(order.total)} for ${order.crop}`, link: `/buyer/orders/${order._id}` });
  res.json({ order: await shape(order, 'farmer') });
});

const completeSchema = z.object({
  stars: z.coerce.number().int().min(1).max(5).optional(),
  comment: z.string().trim().max(300).optional(),
});
export const complete = asyncHandler(async (req, res) => {
  if (roleOf(req) !== 'buyer') throw new AppError('Only the buyer can confirm receipt', 403);
  const data = completeSchema.parse(req.body ?? {});
  const order = await ownOrder(req);
  const updated = await Order.findOneAndUpdate(
    { _id: order._id, status: 'delivered' },
    {
      $set: { status: 'completed', ...(data.stars && { rating: { stars: data.stars, comment: data.comment, at: new Date() } }) },
      $push: { timeline: { status: 'completed', by: 'buyer', at: new Date() } },
    },
    { new: true }
  );
  if (!updated) throw new AppError('Only a delivered order can be confirmed', 409);
  if (data.stars) await Rating.updateOne({ order: updated._id, from: updated.buyer, to: updated.farmer }, { $setOnInsert: { fromRole: 'buyer', toRole: 'farmer', stars: data.stars, comment: data.comment } }, { upsert: true });
  await notify(updated.farmer, { type: 'order', title: 'Order completed', message: `${req.user.name} confirmed receipt of ${updated.crop}${updated.rating?.stars ? ` and rated you ${updated.rating.stars}/5` : ''}`, link: `/farmer/orders/${updated._id}` });
  res.json({ order: await shape(updated, 'buyer') });
});

// Either party can cancel before the goods leave. Stock goes back on the listing.
export const cancel = asyncHandler(async (req, res) => {
  const role = roleOf(req);
  const { reason } = z.object({ reason: z.string().trim().max(300).optional() }).parse(req.body ?? {});
  const session = await mongoose.startSession();
  let result;
  try {
    await session.withTransaction(async () => {
      const order = await ownOrder(req, session);
      if (!['confirmed', 'ready_for_pickup'].includes(order.status)) {
        throw new AppError('This order is already on its way or finished, so it cannot be cancelled', 409);
      }
      order.status = 'cancelled';
      order.cancelledBy = role;
      order.cancelReason = reason;
      order.timeline.push({ status: 'cancelled', by: role, note: reason, at: new Date() });
      await order.save({ session });

      const listing = await CropListing.findByIdAndUpdate(order.listing, { $inc: { availableQty: order.quantity } }, { new: true, session });
      if (listing && ['sold_out', 'partially_sold'].includes(listing.status)) {
        listing.status = listing.availableQty < listing.quantity ? 'partially_sold' : 'active';
        await listing.save({ session });
      }
      await TransportRequest.updateMany(
        { order: order._id, isActive: true },
        { $set: { status: 'cancelled', isActive: false }, $push: { timeline: { status: 'cancelled', at: new Date() } } },
        { session }
      );
      result = order;
    });
  } finally {
    await session.endSession();
  }
  await notify(role === 'farmer' ? result.buyer : result.farmer, { type: 'order', title: 'Order cancelled', message: `${req.user.name} cancelled the order for ${result.crop}${reason ? `: “${reason}”` : ''}`, link: `/${role === 'farmer' ? 'buyer' : 'farmer'}/orders/${result._id}` });
  res.json({ order: await shape(result, role) });
});
