import { z } from 'zod';
import Order from '../models/Order.js';
import TransportRequest from '../models/TransportRequest.js';
import TransportOffer from '../models/TransportOffer.js';
import { AppError, asyncHandler } from '../utils/AppError.js';
import { notify, inr, kg } from '../services/notify.js';
import { reputation } from '../services/ratings.js';

const startOfToday = () => {
  const n = new Date();
  return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()));
};
const OPEN_ORDER = ['confirmed', 'ready_for_pickup'];
// Who must book transport for an order. Older orders had no setting: the buyer.
const responsible = (order) => order.transportBy ?? 'buyer';

const offerSchema = z.object({
  ratePerKm: z.coerce.number().positive('Enter your cost per km').max(1000),
  distanceKm: z.coerce.number().positive('Enter the distance in km').max(3000),
  message: z.string().trim().max(300).optional(),
});

// Sold orders that still have no transporter and fit this vehicle. No phone numbers or addresses yet.
export const opportunities = asyncHandler(async (req, res) => {
  const cap = req.user.vehicleCapacityKg ?? 0;
  if (req.user.isAvailable === false) return res.json({ orders: [], capacityKg: cap, unavailable: true });
  const booked = await TransportRequest.distinct('order', { isActive: true });
  const orders = await Order.find({ status: { $in: OPEN_ORDER }, quantity: { $lte: cap }, _id: { $nin: booked } }, 'crop quantity listing transportBy createdAt')
    .sort({ createdAt: -1 })
    .limit(50)
    .populate('listing', 'village district')
    .lean();
  const mine = await TransportOffer.find({ transporter: req.user._id, order: { $in: orders.map((o) => o._id) }, isPending: true }).lean();
  const byOrder = new Map(mine.map((o) => [String(o.order), o]));
  res.json({
    capacityKg: cap,
    orders: orders.map((o) => {
      const m = byOrder.get(String(o._id));
      return {
        orderId: o._id,
        crop: o.crop,
        weightKg: o.quantity,
        from: [o.listing?.village, o.listing?.district].filter(Boolean).join(', '),
        arrangedBy: responsible(o),
        createdAt: o.createdAt,
        myOffer: m ? { _id: m._id, ratePerKm: m.ratePerKm, distanceKm: m.distanceKm, charge: m.charge } : null,
      };
    }),
  });
});

export const makeOffer = asyncHandler(async (req, res) => {
  const data = offerSchema.parse(req.body);
  const order = await Order.findById(req.params.orderId);
  if (!order || !OPEN_ORDER.includes(order.status)) throw new AppError('This order is not open for transport', 404);
  if (order.quantity > (req.user.vehicleCapacityKg ?? 0)) throw new AppError('This load is heavier than your vehicle capacity', 409);
  if (req.user.isAvailable === false) throw new AppError('Switch your vehicle to available first', 409);
  if (await TransportRequest.exists({ order: order._id, isActive: true })) throw new AppError('A transporter is already booked for this order', 409);

  const charge = Math.round(data.ratePerKm * data.distanceKm);
  let offer;
  try {
    offer = await TransportOffer.create({ order: order._id, transporter: req.user._id, ...data, charge });
  } catch (err) {
    if (err.code === 11000) throw new AppError('You already sent an offer for this order. Withdraw it to send a new one.', 409);
    throw err;
  }
  const who = responsible(order);
  await notify(order[who], {
    type: 'transport',
    title: 'A transporter sent an offer',
    message: `${req.user.name} offers to move ${kg(order.quantity)} of ${order.crop} for ${inr(charge)} (${inr(data.ratePerKm)}/km × ${data.distanceKm} km)`,
    link: `/${who}/orders/${order._id}`,
  });
  res.status(201).json({ offer });
});

export const withdrawOffer = asyncHandler(async (req, res) => {
  const offer = await TransportOffer.findOneAndUpdate(
    { _id: req.params.id, transporter: req.user._id, isPending: true },
    { $set: { status: 'withdrawn', isPending: false } },
    { new: true }
  );
  if (!offer) throw new AppError('Offer not found or already closed', 404);
  res.json({ offer });
});

// The farmer/buyer on the order sees its pending offers (only the responsible side can choose one)
export const orderOffers = asyncHandler(async (req, res) => {
  const role = req.user.role;
  const order = await Order.findOne({ _id: req.params.orderId, [role]: req.user._id }, 'transportBy status').lean();
  if (!order) throw new AppError('Order not found', 404);
  const offers = await TransportOffer.find({ order: order._id, isPending: true })
    .sort({ charge: 1 })
    .populate('transporter', 'name vehicleType vehicleNumber vehicleCapacityKg')
    .lean();
  const scores = await reputation(offers.map((o) => o.transporter?._id));
  res.json({
    canChoose: responsible(order) === role && OPEN_ORDER.includes(order.status),
    arrangedBy: responsible(order),
    offers: offers.map((o) => ({
      _id: o._id,
      ratePerKm: o.ratePerKm,
      distanceKm: o.distanceKm,
      charge: o.charge,
      message: o.message,
      createdAt: o.createdAt,
      transporter: { name: o.transporter?.name, vehicle: [o.transporter?.vehicleType, o.transporter?.vehicleNumber].filter(Boolean).join(' · '), capacityKg: o.transporter?.vehicleCapacityKg, rating: scores.get(String(o.transporter?._id)) ?? null },
    })),
  });
});

const acceptSchema = z.object({
  pickupAddress: z.string().trim().min(5, 'Enter the pickup address').max(200),
  dropAddress: z.string().trim().min(5, 'Enter the delivery address').max(200),
  pickupDate: z.coerce.date().refine((d) => d >= startOfToday(), 'Pickup date cannot be in the past'),
  notes: z.string().trim().max(300).optional(),
});

// Choosing an offer books the transport straight away, with that transporter already assigned
export const acceptOffer = asyncHandler(async (req, res) => {
  const role = req.user.role;
  const data = acceptSchema.parse(req.body);
  const offer = await TransportOffer.findOne({ _id: req.params.id, isPending: true });
  if (!offer) throw new AppError('This offer is no longer available', 404);
  const order = await Order.findOne({ _id: offer.order, [role]: req.user._id });
  if (!order) throw new AppError('Order not found', 404);
  if (responsible(order) !== role) throw new AppError(`The ${responsible(order)} arranges transport for this order`, 409);
  if (!OPEN_ORDER.includes(order.status)) throw new AppError('Transport can only be booked before the order is picked up', 409);

  let t;
  try {
    t = await TransportRequest.create({
      order: order._id,
      requester: req.user._id,
      requesterRole: role,
      farmer: order.farmer,
      buyer: order.buyer,
      transporter: offer.transporter,
      crop: order.crop,
      weightKg: order.quantity,
      pickupAddress: data.pickupAddress,
      dropAddress: data.dropAddress,
      pickupDate: data.pickupDate,
      ratePerKm: offer.ratePerKm,
      distanceKm: offer.distanceKm,
      charge: offer.charge,
      notes: data.notes,
      status: 'accepted',
      timeline: [{ status: 'open' }, { status: 'accepted' }],
    });
  } catch (err) {
    if (err.code === 11000) throw new AppError('This order already has an active transport booking', 409);
    throw err;
  }
  offer.status = 'accepted';
  offer.isPending = false;
  await offer.save();
  const declined = await TransportOffer.find({ order: order._id, isPending: true }, 'transporter').lean();
  await TransportOffer.updateMany({ order: order._id, isPending: true }, { $set: { status: 'declined', isPending: false } });

  await notify(offer.transporter, { type: 'transport', title: 'Your offer was accepted', message: `${req.user.name} chose you to move ${order.crop} (${inr(offer.charge)}). Check the job for pickup details.`, link: '/transporter/requests?tab=mine' });
  for (const d of declined) await notify(d.transporter, { type: 'transport', title: 'Offer not selected', message: `Another transporter was chosen for the ${order.crop} order`, link: '/transporter/requests?tab=trades' });
  const otherRole = role === 'farmer' ? 'buyer' : 'farmer';
  await notify(order[otherRole], { type: 'transport', title: 'Transporter booked', message: `${req.user.name} booked a transporter for the ${order.crop} order`, link: `/${otherRole}/orders/${order._id}` });
  res.status(201).json({ transport: { _id: t._id, status: t.status, charge: t.charge } });
});
