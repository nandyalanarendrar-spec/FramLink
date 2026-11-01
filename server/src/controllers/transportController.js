import mongoose from 'mongoose';
import { z } from 'zod';
import TransportRequest from '../models/TransportRequest.js';
import Order from '../models/Order.js';
import { AppError, asyncHandler } from '../utils/AppError.js';
import User from '../models/User.js';
import { notify, notifyMany, inr, kg } from '../services/notify.js';
import { ratingOf } from '../services/ratings.js';

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const roleOf = (req) => req.user.role; // 'farmer' | 'buyer' | 'transporter'
const other = (role) => (role === 'farmer' ? 'buyer' : 'farmer');

const startOfToday = () => {
  const n = new Date();
  return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()));
};

const createSchema = z.object({
  orderId: z.string().min(1),
  pickupAddress: z.string().trim().min(5, 'Enter the pickup address').max(200),
  dropAddress: z.string().trim().min(5, 'Enter the delivery address').max(200),
  pickupDate: z.coerce.date().refine((d) => d >= startOfToday(), 'Pickup date cannot be in the past'),
  // Price it per km (total = rate x km), or give a flat total
  ratePerKm: z.coerce.number().positive('Enter the cost per km').max(1000).optional(),
  distanceKm: z.coerce.number().positive('Enter the distance in km').max(3000).optional(),
  charge: z.coerce.number().positive('Enter the transport charge').max(1_000_000).optional(),
  notes: z.string().trim().max(300).optional(),
  transporterId: z.string().optional(), // book one transporter from the vehicle list
});
const totalCharge = (d) => (d.ratePerKm && d.distanceKm ? Math.round(d.ratePerKm * d.distanceKm) : d.charge);

// Who sees what. Farmer and buyer see the transporter once one is assigned.
// The transporter sees who asked for the trip, and both parties' phones once the job is theirs.
function shape(t, role) {
  const { transporter, farmer, buyer, requester, order, ...rest } = t;
  const assigned = ['accepted', 'picked_up', 'delivered'].includes(t.status) && transporter;
  const requestedBy = t.requesterRole ?? 'farmer'; // older rows were always requested by the farmer

  if (role === 'transporter') {
    return {
      ...rest,
      requestedBy,
      orderId: order?._id ?? order,
      orderStatus: order?.status,
      counterpart: { name: requester?.name ?? farmer?.name },
      contacts: assigned ? { farmer: { name: farmer?.name, phone: farmer?.phone }, buyer: { name: buyer?.name, phone: buyer?.phone } } : null,
    };
  }
  return {
    ...rest,
    requestedBy,
    orderId: order?._id ?? order,
    orderStatus: order?.status,
    counterpart: assigned ? { name: transporter.name, phone: transporter.phone, vehicle: [transporter.vehicleType, transporter.vehicleNumber].filter(Boolean).join(' · ') } : null,
  };
}

const populate = (q) =>
  q
    .populate('transporter', 'name phone vehicleType vehicleNumber vehicleCapacityKg')
    .populate('farmer', 'name phone')
    .populate('buyer', 'name phone')
    .populate('requester', 'name')
    .populate('order', 'status');

// Either side of an order (its farmer or its buyer) can ask for transport
export const create = asyncHandler(async (req, res) => {
  const role = roleOf(req);
  const data = createSchema.parse(req.body);
  const order = await Order.findOne({ _id: data.orderId, [role]: req.user._id });
  if (!order) throw new AppError('Order not found', 404);
  if (!['confirmed', 'ready_for_pickup'].includes(order.status)) throw new AppError('Transport can only be requested before the order is picked up', 409);
  // The side that agreed to arrange transport books it; the other side has nothing to do (older orders: either side)
  if (order.transportBy && order.transportBy !== role) throw new AppError(`The ${order.transportBy} arranges transport for this order`, 409);
  const charge = totalCharge(data);
  if (!charge) throw new AppError('Enter the cost per km and the distance, or the total charge', 400);

  let target;
  if (data.transporterId) {
    target = await User.findOne({ _id: data.transporterId, role: 'transporter', verificationStatus: 'verified', isActive: true, isAvailable: { $ne: false } }, 'vehicleCapacityKg name').lean();
    if (!target) throw new AppError('This vehicle is not available', 404);
    if ((target.vehicleCapacityKg ?? 0) < order.quantity) throw new AppError('This vehicle cannot carry that much', 409);
  }

  let t;
  try {
    t = await TransportRequest.create({
      order: order._id,
      requester: req.user._id,
      requesterRole: role,
      targetTransporter: target?._id,
      farmer: order.farmer,
      buyer: order.buyer,
      crop: order.crop,
      weightKg: order.quantity,
      pickupAddress: data.pickupAddress,
      dropAddress: data.dropAddress,
      pickupDate: data.pickupDate,
      ratePerKm: data.ratePerKm,
      distanceKm: data.distanceKm,
      charge,
      notes: data.notes,
      timeline: [{ status: 'open' }],
    });
  } catch (err) {
    if (err.code === 11000) throw new AppError('This order already has an active transport request', 409);
    throw err;
  }
  // Tell verified transporters whose vehicle can carry this load, and the other party on the order
  const fit = target ? [{ _id: target._id }] : await User.find({ role: 'transporter', verificationStatus: 'verified', isActive: true, isAvailable: { $ne: false }, vehicleCapacityKg: { $gte: t.weightKg } }, '_id').limit(100).lean();
  await notifyMany(fit.map((u) => u._id), { type: 'transport', title: 'New transport job', message: `${kg(t.weightKg)} of ${t.crop}: ${t.pickupAddress} → ${t.dropAddress} for ${inr(t.charge)}`, link: '/transporter/requests' });
  await notify(role === 'farmer' ? order.buyer : order.farmer, {
    type: 'transport',
    title: 'Transport requested',
    message: `${req.user.name} requested a vehicle for the ${t.crop} order (${inr(t.charge)})`,
    link: `/${other(role)}/orders/${order._id}`,
  });
  res.status(201).json({ transport: shape(await populate(TransportRequest.findById(t._id)).lean(), role) });
});

// Open jobs a verified transporter can take: only those that fit the vehicle's capacity
export const available = asyncHandler(async (req, res) => {
  const cap = req.user.vehicleCapacityKg ?? 0;
  if (req.user.isAvailable === false) return res.json({ transports: [], capacityKg: cap, unavailable: true });
  const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 60) : '';
  const filter = { status: 'open', weightKg: { $lte: cap }, $and: [{ $or: [{ targetTransporter: { $exists: false } }, { targetTransporter: null }, { targetTransporter: req.user._id }] }] };
  if (q) filter.$and.push({ $or: [{ pickupAddress: { $regex: escapeRegex(q), $options: 'i' } }, { dropAddress: { $regex: escapeRegex(q), $options: 'i' } }] });
  const sort = req.query.sort === 'pay' ? { charge: -1 } : { createdAt: -1 };
  const docs = await populate(TransportRequest.find(filter).sort(sort).limit(50)).lean();
  res.json({ transports: docs.map((d) => shape(d, 'transporter')), capacityKg: cap });
});

export const mine = asyncHandler(async (req, res) => {
  const role = roleOf(req);
  const owner = { [role]: req.user._id }; // farmer / buyer / transporter field on the request
  const tab = req.query.tab === 'history' ? 'history' : 'active';
  const filter = { ...owner, ...(tab === 'active' ? { isActive: true } : { isActive: false }) };

  const [docs, activeN, historyN, earn] = await Promise.all([
    populate(TransportRequest.find(filter).sort({ updatedAt: -1 })).lean(),
    TransportRequest.countDocuments({ ...owner, isActive: true }),
    TransportRequest.countDocuments({ ...owner, isActive: false }),
    TransportRequest.aggregate([
      { $match: { ...owner, status: 'delivered' } },
      { $addFields: { final: { $ifNull: ['$finalCharge', '$charge'] } } },
      { $group: { _id: null, trips: { $sum: 1 }, amount: { $sum: '$final' }, received: { $sum: { $cond: [{ $eq: ['$paymentStatus', 'paid'] }, '$final', 0] } }, kg: { $sum: '$weightKg' } } },
    ]),
  ]);
  res.json({
    transports: docs.map((d) => shape(d, role)),
    counts: { active: activeN, history: historyN },
    summary: { trips: earn[0]?.trips ?? 0, amount: earn[0]?.amount ?? 0, received: earn[0]?.received ?? 0, pending: (earn[0]?.amount ?? 0) - (earn[0]?.received ?? 0), kg: earn[0]?.kg ?? 0, rating: role === 'transporter' ? await ratingOf(req.user._id) : undefined },
  });
});

export const accept = asyncHandler(async (req, res) => {
  const cap = req.user.vehicleCapacityKg ?? 0;
  // Only one transporter can win: the update matches while the job is still open
  const t = await TransportRequest.findOneAndUpdate(
    { _id: req.params.id, status: 'open', weightKg: { $lte: cap }, $or: [{ targetTransporter: { $exists: false } }, { targetTransporter: null }, { targetTransporter: req.user._id }] },
    { $set: { status: 'accepted', transporter: req.user._id }, $push: { timeline: { status: 'accepted', at: new Date() } } },
    { new: true }
  );
  if (!t) throw new AppError('This job is no longer available, or it is heavier than your vehicle capacity', 409);
  // The requester is told first; the other party on the order hears about it too
  const reqRole = t.requesterRole ?? 'farmer';
  await notify(t.requester ?? t.farmer, { type: 'transport', title: 'Transporter assigned', message: `${req.user.name} accepted your transport job for ${t.crop}`, link: `/${reqRole}/orders/${t.order}` });
  await notify(reqRole === 'farmer' ? t.buyer : t.farmer, { type: 'transport', title: 'Transporter assigned', message: `${req.user.name} will transport the ${t.crop} order`, link: `/${other(reqRole)}/orders/${t.order}` });
  res.json({ transport: shape(await populate(TransportRequest.findById(t._id)).lean(), 'transporter') });
});

// Transporter marks pickup then delivery; the order moves with it (both writes succeed or neither)
const MAX_KM_OVER = 1.3; // actual distance may be up to 30% above what was agreed
const NEXT = { picked_up: { from: 'accepted', orderFrom: 'ready_for_pickup', orderTo: 'in_transit' }, delivered: { from: 'picked_up', orderFrom: 'in_transit', orderTo: 'delivered' } };
export const setStatus = asyncHandler(async (req, res) => {
  const { status, actualKm } = z.object({ status: z.enum(['picked_up', 'delivered']), actualKm: z.coerce.number().positive('Enter the kilometres driven').max(3000).optional() }).parse(req.body);
  const step = NEXT[status];
  const session = await mongoose.startSession();
  let id;
  try {
    await session.withTransaction(async () => {
      const t = await TransportRequest.findOne({ _id: req.params.id, transporter: req.user._id }).session(session);
      if (!t) throw new AppError('Job not found', 404);
      if (t.status !== step.from) throw new AppError(`Cannot mark a ${t.status.replace('_', ' ')} job as ${status.replace('_', ' ')}`, 409);

      const order = await Order.findOneAndUpdate(
        { _id: t.order, status: step.orderFrom },
        { $set: { status: step.orderTo }, $push: { timeline: { status: step.orderTo, by: 'transporter', at: new Date() } } },
        { new: true, session }
      );
      if (!order) {
        throw new AppError(status === 'picked_up' ? 'The farmer has not marked the order ready for pickup yet' : 'The order is not in transit', 409);
      }
      const now = new Date();
      if (status === 'picked_up') t.pickedUpAt = now;
      if (status === 'delivered') {
        // A per-km job is priced on the kilometres actually driven. Far more than agreed needs a new agreement, not a bigger bill.
        if (t.ratePerKm) {
          if (!actualKm) throw new AppError('Enter the total kilometres you drove', 400);
          if (t.distanceKm && actualKm > t.distanceKm * MAX_KM_OVER) {
            throw new AppError(`That is more than ${Math.round((MAX_KM_OVER - 1) * 100)}% above the agreed ${t.distanceKm} km. Ask the ${t.requesterRole ?? 'farmer'} to agree the new distance first.`, 409);
          }
          t.actualKm = actualKm;
          t.finalCharge = Math.round(t.ratePerKm * actualKm);
        } else {
          if (actualKm) t.actualKm = actualKm;
          t.finalCharge = t.charge;
        }
        t.deliveredAt = now;
        t.isActive = false;
      }
      t.status = status;
      t.timeline.push({ status, at: now });
      await t.save({ session });
      id = t._id;
    });
  } finally {
    await session.endSession();
  }
  const tr = await TransportRequest.findById(id, 'farmer buyer requester order crop actualKm finalCharge').lean();
  const msg = status === 'picked_up' ? `${tr.crop} has been picked up by ${req.user.name}` : `${tr.crop} has been delivered by ${req.user.name}`;
  const title = status === 'picked_up' ? 'Picked up, now in transit' : 'Delivered';
  await notify(tr.farmer, { type: 'order', title, message: msg, link: `/farmer/orders/${tr.order}` });
  await notify(tr.buyer, { type: 'order', title, message: msg, link: `/buyer/orders/${tr.order}` });
  if (status === 'delivered' && tr.requester) {
    const side = String(tr.requester) === String(tr.farmer) ? 'farmer' : 'buyer';
    await notify(tr.requester, { type: 'transport', title: 'Transport bill', message: `${req.user.name} drove ${tr.actualKm ? `${tr.actualKm} km` : 'the trip'}. Final transport cost: ${inr(tr.finalCharge)}. Pay them directly.`, link: `/${side}/orders/${tr.order}` });
  }
  res.json({ transport: shape(await populate(TransportRequest.findById(id)).lean(), 'transporter') });
});

// The transporter records that the money arrived (payment itself is settled offline)
export const markPaid = asyncHandler(async (req, res) => {
  const t = await TransportRequest.findOneAndUpdate(
    { _id: req.params.id, transporter: req.user._id, status: 'delivered', paymentStatus: { $ne: 'paid' } },
    { $set: { paymentStatus: 'paid', paidAt: new Date() } },
    { new: true }
  );
  if (!t) throw new AppError('Only a delivered job that is not yet marked paid can be marked paid', 409);
  if (t.requester) await notify(t.requester, { type: 'transport', title: 'Transport payment recorded', message: `${req.user.name} marked ${inr(t.finalCharge ?? t.charge)} as received for the ${t.crop} trip`, link: `/${t.requesterRole ?? 'farmer'}/orders/${t.order}` });
  res.json({ transport: shape(await populate(TransportRequest.findById(t._id)).lean(), 'transporter') });
});

// Transporter backs out before pickup: the job goes back to the open list
export const release = asyncHandler(async (req, res) => {
  const t = await TransportRequest.findOneAndUpdate(
    { _id: req.params.id, transporter: req.user._id, status: 'accepted' },
    { $set: { status: 'open' }, $unset: { transporter: '' }, $push: { timeline: { status: 'open', at: new Date() } } },
    { new: true }
  );
  if (!t) throw new AppError('You can only release a job before pickup', 409);
  const reqRole = t.requesterRole ?? 'farmer';
  await notify(t.requester ?? t.farmer, { type: 'transport', title: 'Transporter withdrew', message: `${req.user.name} released the transport job for ${t.crop}. It is open again.`, link: `/${reqRole}/orders/${t.order}` });
  res.json({ transport: shape(await populate(TransportRequest.findById(t._id)).lean(), 'transporter') });
});

// Only whoever asked for the transport can cancel it (older requests count as the farmer's)
export const cancel = asyncHandler(async (req, res) => {
  const role = roleOf(req);
  const t = await TransportRequest.findOneAndUpdate(
    {
      _id: req.params.id,
      status: { $in: ['open', 'accepted'] },
      $or: [{ requester: req.user._id }, { requester: { $exists: false }, farmer: req.user._id }],
    },
    { $set: { status: 'cancelled', isActive: false }, $push: { timeline: { status: 'cancelled', at: new Date() } } },
    { new: true }
  );
  if (!t) throw new AppError('Only the person who requested an open or accepted transport can cancel it', 409);
  if (t.transporter) await notify(t.transporter, { type: 'transport', title: 'Job cancelled', message: `The ${role} cancelled the transport job for ${t.crop}`, link: '/transporter/requests' });
  res.json({ transport: shape(await populate(TransportRequest.findById(t._id)).lean(), role) });
});
