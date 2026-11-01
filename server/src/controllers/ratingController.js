import { z } from 'zod';
import Order from '../models/Order.js';
import Rating from '../models/Rating.js';
import TransportRequest from '../models/TransportRequest.js';
import { AppError, asyncHandler } from '../utils/AppError.js';
import { notify } from '../services/notify.js';
import { ratingOf } from '../services/ratings.js';

const RATEABLE = ['delivered', 'completed'];

// The people on an order: farmer, buyer and (once something was delivered) the transporter. Returns { role: user doc } for populated names.
async function partiesOf(order) {
  const delivered = await TransportRequest.findOne({ order: order._id, status: 'delivered' }, 'transporter').populate('transporter', 'name').lean();
  await order.populate([{ path: 'farmer', select: 'name' }, { path: 'buyer', select: 'name' }]);
  return {
    farmer: { id: order.farmer._id, name: order.farmer.name },
    buyer: { id: order.buyer._id, name: order.buyer.name },
    ...(delivered?.transporter && { transporter: { id: delivered.transporter._id, name: delivered.transporter.name } }),
  };
}

// Which role is this user on this order? Transporters count only for orders they delivered.
const myRole = (req, parties) => Object.keys(parties).find((r) => String(parties[r].id) === String(req.user._id));

async function loadOrder(req) {
  const order = await Order.findById(req.params.orderId ?? req.body.orderId);
  if (!order) throw new AppError('Order not found', 404);
  const parties = await partiesOf(order);
  const role = myRole(req, parties);
  if (!role) throw new AppError('Order not found', 404);
  return { order, parties, role };
}

// Who can I rate on this order, and what did I already give?
export const forOrder = asyncHandler(async (req, res) => {
  const { order, parties, role } = await loadOrder(req);
  const mine = await Rating.find({ order: order._id, from: req.user._id }).lean();
  const given = new Map(mine.map((r) => [r.toRole, r]));
  res.json({
    open: RATEABLE.includes(order.status),
    targets: Object.entries(parties)
      .filter(([r]) => r !== role)
      .map(([r, p]) => ({ role: r, name: p.name, given: given.get(r) ? { stars: given.get(r).stars, comment: given.get(r).comment } : null })),
  });
});

const rateSchema = z.object({
  orderId: z.string().min(1),
  target: z.enum(['farmer', 'buyer', 'transporter']),
  stars: z.coerce.number().int().min(1).max(5),
  comment: z.string().trim().max(300).optional(),
});

export const rate = asyncHandler(async (req, res) => {
  const data = rateSchema.parse(req.body);
  const { order, parties, role } = await loadOrder(req);
  if (!RATEABLE.includes(order.status)) throw new AppError('You can rate once the order is delivered', 409);
  if (data.target === role) throw new AppError('You cannot rate yourself', 400);
  const target = parties[data.target];
  if (!target) throw new AppError('That person is not part of this order yet', 404);

  try {
    await Rating.create({ order: order._id, from: req.user._id, to: target.id, fromRole: role, toRole: data.target, stars: data.stars, comment: data.comment });
  } catch (err) {
    if (err.code === 11000) throw new AppError('You already rated this person for this order', 409);
    throw err;
  }
  // Keep the order's own copy of the buyer's rating of the farmer in step with it
  if (role === 'buyer' && data.target === 'farmer' && !order.rating?.stars) {
    await Order.updateOne({ _id: order._id }, { $set: { rating: { stars: data.stars, comment: data.comment, at: new Date() } } });
  }
  await notify(target.id, { type: 'order', title: 'You got a rating', message: `${req.user.name} rated you ${data.stars}/5`, link: data.target === 'transporter' ? '/transporter/requests' : `/${data.target}/orders/${order._id}` });
  res.status(201).json({ ok: true });
});

// My own score and the latest comments people left
export const mine = asyncHandler(async (req, res) => {
  const [summary, recent] = await Promise.all([
    ratingOf(req.user._id),
    Rating.find({ to: req.user._id }).sort({ createdAt: -1 }).limit(10).populate('from', 'name').lean(),
  ]);
  res.json({
    rating: summary,
    recent: recent.map((r) => ({ stars: r.stars, comment: r.comment, fromRole: r.fromRole, from: r.from?.name, at: r.createdAt })),
  });
});
