import mongoose from 'mongoose';
import { z } from 'zod';
import Demand from '../models/Demand.js';
import DemandOffer from '../models/DemandOffer.js';
import CropListing from '../models/CropListing.js';
import PurchaseRequest from '../models/PurchaseRequest.js';
import Order from '../models/Order.js';
import { AppError, asyncHandler } from '../utils/AppError.js';
import { liveFilter } from '../utils/listing.js';
import { notify, notifyMany, inr, kg } from '../services/notify.js';
import { reputation } from '../services/ratings.js';
import { transportFields, resolveTransport, notifyTransportersOfTrade } from './requestController.js';

const MAX_OPEN = 5; // open wanted posts per buyer
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const startOfToday = () => {
  const n = new Date();
  return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()));
};
const endOfDay = (d) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 23, 59, 59, 999));
const liveDemand = () => ({ isOpen: true, neededBy: { $gte: startOfToday() } });
const sameCrop = (crop) => ({ $regex: `^${escapeRegex(crop)}$`, $options: 'i' });
const remaining = (d) => d.quantity - d.filledQty;

// ---------- Buyer: post, list, close

const createSchema = z.object({
  crop: z.string().trim().min(2, 'Crop name is required').max(60),
  quantity: z.coerce.number().positive('Quantity must be greater than 0').max(10_000_000),
  maxPrice: z.coerce.number().positive('Maximum price must be greater than 0').max(1_000_000),
  neededBy: z.coerce.date().transform(endOfDay).refine((d) => d >= startOfToday(), 'Needed-by date cannot be in the past'),
  deliverTo: z.string().trim().min(3, 'Where should it be delivered?').max(120),
  notes: z.string().trim().max(300).optional(),
});

export const create = asyncHandler(async (req, res) => {
  const data = createSchema.parse(req.body);
  if ((await Demand.countDocuments({ buyer: req.user._id, ...liveDemand() })) >= MAX_OPEN) {
    throw new AppError(`You can have up to ${MAX_OPEN} open requests. Close one first.`, 400);
  }
  const demand = await Demand.create({ ...data, buyer: req.user._id, cropKey: data.crop.toLowerCase() });

  // Farmers who already have this crop listed hear about it straight away; everyone else finds it on the board
  const farmers = await CropListing.distinct('farmer', { ...liveFilter(), crop: sameCrop(data.crop) });
  await notifyMany(farmers, {
    type: 'demand',
    title: 'A buyer wants your crop',
    message: `${req.user.name} wants ${kg(data.quantity)} of ${data.crop} at up to ${inr(data.maxPrice)}/kg`,
    link: '/farmer/wanted',
  });
  res.status(201).json({ demand });
});

const view = (d, extra = {}) => ({ ...d, remaining: remaining(d), expired: d.isOpen && d.neededBy < startOfToday(), ...extra });

export const mine = asyncHandler(async (req, res) => {
  const demands = await Demand.find({ buyer: req.user._id }).sort({ createdAt: -1 }).limit(100).lean();
  const counts = await DemandOffer.aggregate([
    { $match: { demand: { $in: demands.map((d) => d._id) }, isPending: true } },
    { $group: { _id: '$demand', n: { $sum: 1 } } },
  ]);
  const byDemand = new Map(counts.map((c) => [String(c._id), c.n]));
  res.json({ demands: demands.map((d) => view(d, { pendingOffers: byDemand.get(String(d._id)) ?? 0 })) });
});

// One wanted post with the offers farmers made on it
export const detail = asyncHandler(async (req, res) => {
  const demand = await Demand.findOne({ _id: req.params.id, buyer: req.user._id }).lean();
  if (!demand) throw new AppError('Request not found', 404);
  const offers = await DemandOffer.find({ demand: demand._id, status: { $in: ['pending', 'accepted'] } })
    .sort({ price: 1, createdAt: 1 })
    .populate('farmer', 'name')
    .populate('listing', 'village district grade images availableQty')
    .lean();
  const scores = await reputation(offers.map((o) => o.farmer?._id));
  res.json({
    demand: view(demand),
    offers: offers.map((o) => ({
      _id: o._id,
      status: o.status,
      quantity: o.quantity,
      price: o.price,
      total: o.quantity * o.price,
      transportBy: o.transportBy,
      ratePerKm: o.ratePerKm,
      distanceKm: o.distanceKm,
      transportCharge: o.transportBy === 'farmer' ? o.transportCharge : 0,
      grandTotal: o.quantity * o.price + (o.transportBy === 'farmer' ? o.transportCharge : 0),
      message: o.message,
      orderId: o.order ?? null,
      farmer: { name: o.farmer?.name, rating: scores.get(String(o.farmer?._id)) ?? null },
      listing: { village: o.listing?.village, district: o.listing?.district, grade: o.listing?.grade, image: o.listing?.images?.[0], availableQty: o.listing?.availableQty },
    })),
  });
});

// Decline whatever is still pending on a post and tell those farmers
async function declinePending(demand, why, exceptId) {
  const pending = await DemandOffer.find({ demand: demand._id, isPending: true, ...(exceptId && { _id: { $ne: exceptId } }) }, 'farmer').lean();
  if (!pending.length) return;
  await DemandOffer.updateMany({ _id: { $in: pending.map((p) => p._id) } }, { $set: { status: 'declined', isPending: false } });
  await notifyMany(pending.map((p) => p.farmer), { type: 'demand', title: 'Wanted request closed', message: `The ${demand.crop} request was ${why}. Your offer was not used.`, link: '/farmer/wanted?tab=offers' });
}

export const close = asyncHandler(async (req, res) => {
  const demand = await Demand.findOneAndUpdate({ _id: req.params.id, buyer: req.user._id, isOpen: true }, { $set: { status: 'closed', isOpen: false } }, { new: true });
  if (!demand) throw new AppError('Request not found or already closed', 404);
  await declinePending(demand, 'closed by the buyer');
  res.json({ demand: view(demand.toObject()) });
});

// ---------- Farmer: the board, offers

// Every open wanted post, with the farmer's own matching listings next to it. No contact details.
export const board = asyncHandler(async (req, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 60) : '';
  const place = typeof req.query.place === 'string' ? req.query.place.trim().slice(0, 60) : '';
  const filter = { ...liveDemand() };
  if (q) filter.cropKey = { $regex: escapeRegex(q.toLowerCase()) };
  if (place) filter.deliverTo = { $regex: escapeRegex(place), $options: 'i' };

  const demands = await Demand.find(filter).sort({ neededBy: 1, createdAt: -1 }).limit(100).populate('buyer', 'name buyerType businessName').lean();
  const [listings, mine, scores] = await Promise.all([
    CropListing.find({ farmer: req.user._id, ...liveFilter() }, 'crop availableQty expectedPrice minOrderQty').lean(),
    DemandOffer.find({ farmer: req.user._id, demand: { $in: demands.map((d) => d._id) }, isPending: true }).lean(),
    reputation(demands.map((d) => d.buyer?._id)),
  ]);
  const mineBy = new Map(mine.map((o) => [String(o.demand), o]));
  res.json({
    demands: demands.map((d) => ({
      ...view({ ...d, buyer: undefined }),
      buyer: { name: d.buyer?.name, type: d.buyer?.buyerType, business: d.buyer?.businessName, rating: scores.get(String(d.buyer?._id)) ?? null },
      matching: listings.filter((l) => l.crop.toLowerCase() === d.cropKey).map((l) => ({ _id: l._id, availableQty: l.availableQty, expectedPrice: l.expectedPrice, minOrderQty: l.minOrderQty })),
      myOffer: mineBy.get(String(d._id)) ? { _id: mineBy.get(String(d._id))._id, quantity: mineBy.get(String(d._id)).quantity, price: mineBy.get(String(d._id)).price } : null,
    })),
  });
});

const offerSchema = z.object({
  listingId: z.string().min(1),
  quantity: z.coerce.number().positive('Quantity must be greater than 0').max(10_000_000),
  price: z.coerce.number().positive('Price must be greater than 0').max(1_000_000),
  message: z.string().trim().max(300).optional(),
  ...transportFields,
});

export const makeOffer = asyncHandler(async (req, res) => {
  const data = offerSchema.parse(req.body);
  const demand = await Demand.findOne({ _id: req.params.id, ...liveDemand() });
  if (!demand) throw new AppError('This request is closed', 404);
  if (data.quantity > remaining(demand)) throw new AppError(`The buyer still needs only ${remaining(demand)} kg`, 400);
  if (data.price > demand.maxPrice) throw new AppError(`The buyer pays at most ${inr(demand.maxPrice)}/kg`, 400);

  const listing = await CropListing.findOne({ _id: data.listingId, farmer: req.user._id, ...liveFilter() });
  if (!listing) throw new AppError('Choose one of your live listings', 404);
  if (listing.crop.toLowerCase() !== demand.cropKey) throw new AppError(`That listing is not ${demand.crop}`, 400);
  if (data.quantity > listing.availableQty) throw new AppError(`You only have ${listing.availableQty} kg available on that listing`, 400);
  if (listing.minOrderQty && data.quantity < listing.minOrderQty) throw new AppError(`Your minimum order on that listing is ${listing.minOrderQty} kg`, 400);
  const transport = resolveTransport(data);

  let offer;
  try {
    offer = await DemandOffer.create({
      demand: demand._id,
      farmer: req.user._id,
      listing: listing._id,
      quantity: data.quantity,
      price: data.price,
      message: data.message,
      ...transport,
    });
  } catch (err) {
    if (err.code === 11000) throw new AppError('You already have a pending offer on this request. Withdraw it to send a new one.', 409);
    throw err;
  }
  const total = data.quantity * data.price + transport.transportCharge;
  await notify(demand.buyer, {
    type: 'demand',
    title: 'A farmer answered your request',
    message: `${req.user.name} offers ${kg(data.quantity)} of ${demand.crop} at ${inr(data.price)}/kg${transport.transportBy === 'farmer' ? ` with delivery (${inr(total)} total)` : ''}`,
    link: '/buyer/wanted',
  });
  res.status(201).json({ offer });
});

export const myOffers = asyncHandler(async (req, res) => {
  const offers = await DemandOffer.find({ farmer: req.user._id }).sort({ createdAt: -1 }).limit(100).populate('demand', 'crop quantity maxPrice neededBy deliverTo status').lean();
  res.json({
    offers: offers.map((o) => ({
      _id: o._id,
      status: o.status,
      quantity: o.quantity,
      price: o.price,
      transportBy: o.transportBy,
      transportCharge: o.transportBy === 'farmer' ? o.transportCharge : 0,
      grandTotal: o.quantity * o.price + (o.transportBy === 'farmer' ? o.transportCharge : 0),
      orderId: o.order ?? null,
      createdAt: o.createdAt,
      demand: o.demand && { crop: o.demand.crop, maxPrice: o.demand.maxPrice, neededBy: o.demand.neededBy, deliverTo: o.demand.deliverTo, status: o.demand.status },
    })),
  });
});

export const withdrawOffer = asyncHandler(async (req, res) => {
  const offer = await DemandOffer.findOneAndUpdate({ _id: req.params.id, farmer: req.user._id, isPending: true }, { $set: { status: 'withdrawn', isPending: false } }, { new: true });
  if (!offer) throw new AppError('Offer not found or already closed', 404);
  res.json({ offer });
});

// ---------- Buyer: choose an offer

export const declineOffer = asyncHandler(async (req, res) => {
  const offer = await DemandOffer.findOne({ _id: req.params.id, isPending: true }).populate('demand', 'buyer crop');
  if (!offer || String(offer.demand?.buyer) !== String(req.user._id)) throw new AppError('Offer not found', 404);
  offer.status = 'declined';
  offer.isPending = false;
  await offer.save();
  await notify(offer.farmer, { type: 'demand', title: 'Offer not accepted', message: `${req.user.name} did not accept your ${offer.demand.crop} offer`, link: '/farmer/wanted?tab=offers' });
  res.json({ offer });
});

// Accepting reserves the farmer's stock and creates an order, all in one transaction
export const acceptOffer = asyncHandler(async (req, res) => {
  const session = await mongoose.startSession();
  let out;
  try {
    await session.withTransaction(async () => {
      const offer = await DemandOffer.findOne({ _id: req.params.id, isPending: true }).session(session);
      if (!offer) throw new AppError('This offer is no longer available', 404);
      const demand = await Demand.findOne({ _id: offer.demand, buyer: req.user._id }).session(session);
      if (!demand) throw new AppError('Offer not found', 404);
      if (!demand.isOpen || demand.neededBy < startOfToday()) throw new AppError('This request is closed', 409);
      if (offer.quantity > remaining(demand)) throw new AppError(`Only ${remaining(demand)} kg of this request is still needed. Decline this offer and ask for a smaller quantity.`, 409);

      const listing = await CropListing.findOneAndUpdate(
        { _id: offer.listing, farmer: offer.farmer, ...liveFilter(), availableQty: { $gte: offer.quantity } },
        { $inc: { availableQty: -offer.quantity } },
        { new: true, session }
      );
      if (!listing) throw new AppError('The farmer no longer has enough stock for this offer', 409);
      listing.status = listing.availableQty <= 0 ? 'sold_out' : 'partially_sold';
      await listing.save({ session });

      const shipping = offer.transportBy === 'farmer' ? offer.transportCharge : 0;
      const total = offer.quantity * offer.price;
      const now = new Date();
      const [pr] = await PurchaseRequest.create(
        [{
          demand: demand._id,
          listing: listing._id,
          farmer: offer.farmer,
          buyer: req.user._id,
          crop: demand.crop,
          askingPrice: listing.expectedPrice,
          quantity: offer.quantity,
          price: offer.price,
          transportBy: offer.transportBy,
          ratePerKm: offer.ratePerKm,
          distanceKm: offer.distanceKm,
          transportCharge: shipping,
          status: 'accepted',
          isOpen: false,
          finalPrice: offer.price,
          finalQuantity: offer.quantity,
          acceptedAt: now,
          message: demand.notes,
          history: [
            { by: 'farmer', action: 'offer', price: offer.price, quantity: offer.quantity, transportBy: offer.transportBy, transportCharge: shipping, message: offer.message, at: now },
            { by: 'buyer', action: 'accept', price: offer.price, quantity: offer.quantity, at: now },
          ],
        }],
        { session }
      );
      const [order] = await Order.create(
        [{
          request: pr._id,
          listing: listing._id,
          farmer: offer.farmer,
          buyer: req.user._id,
          crop: demand.crop,
          quantity: offer.quantity,
          price: offer.price,
          total,
          transportBy: offer.transportBy,
          ratePerKm: offer.ratePerKm,
          distanceKm: offer.distanceKm,
          transportCharge: shipping,
          grandTotal: total + shipping,
          timeline: [{ status: 'confirmed', by: 'system' }],
        }],
        { session }
      );

      offer.status = 'accepted';
      offer.isPending = false;
      offer.order = order._id;
      await offer.save({ session });
      demand.filledQty += offer.quantity;
      if (demand.filledQty >= demand.quantity) {
        demand.status = 'filled';
        demand.isOpen = false;
      }
      await demand.save({ session });
      out = { offer: offer.toObject(), demand: demand.toObject(), orderId: order._id };
    });
  } finally {
    await session.endSession();
  }

  await notify(out.offer.farmer, { type: 'order', title: 'Your offer was accepted', message: `${req.user.name} accepted ${kg(out.offer.quantity)} of ${out.demand.crop} at ${inr(out.offer.price)}/kg. The order is confirmed.`, link: `/farmer/orders/${out.orderId}` });
  await notifyTransportersOfTrade(out.demand.crop, out.offer.quantity);
  if (!out.demand.isOpen) await declinePending(out.demand, 'filled by another offer', out.offer._id);
  res.json({ orderId: out.orderId, filled: !out.demand.isOpen });
});

