import mongoose from 'mongoose';
import { z } from 'zod';
import PurchaseRequest, { OPEN } from '../models/PurchaseRequest.js';
import CropListing from '../models/CropListing.js';
import Order from '../models/Order.js';
import { AppError, asyncHandler } from '../utils/AppError.js';
import { liveFilter } from '../utils/listing.js';
import User from '../models/User.js';
import { ratingOf } from '../services/ratings.js';
import { notify, notifyMany, inr, kg } from '../services/notify.js';

const MAX_ROUNDS = 12; // offers + counter-offers before a request must be accepted or closed

const offerFields = {
  quantity: z.coerce.number().positive('Quantity must be greater than 0').max(10_000_000),
  price: z.coerce.number().positive('Price must be greater than 0').max(1_000_000),
  message: z.string().trim().max(300).optional(),
};
// Who arranges transport. Farmer delivery needs a cost per km and a distance; the total is added to the buyer's bill.
export const transportFields = {
  transportBy: z.enum(['buyer', 'farmer']).optional(),
  ratePerKm: z.coerce.number().positive('Enter the cost per km').max(1000).optional(),
  distanceKm: z.coerce.number().positive('Enter the distance in km').max(3000).optional(),
};
export function resolveTransport(input, current) {
  const transportBy = input.transportBy ?? current?.transportBy ?? 'buyer';
  if (transportBy === 'buyer') return { transportBy, ratePerKm: null, distanceKm: null, transportCharge: 0 };
  const ratePerKm = input.ratePerKm ?? current?.ratePerKm;
  const distanceKm = input.distanceKm ?? current?.distanceKm;
  if (!ratePerKm || !distanceKm) throw new AppError('For farmer delivery, enter the cost per km and the distance', 400);
  return { transportBy, ratePerKm, distanceKm, transportCharge: Math.round(ratePerKm * distanceKm) };
}

const createSchema = z.object({
  listingId: z.string().min(1),
  ...offerFields,
  ...transportFields,
  neededBy: z.coerce.date().optional(),
});
const counterSchema = z.object({ quantity: offerFields.quantity.optional(), price: offerFields.price, message: offerFields.message, ...transportFields });
const reasonSchema = z.object({ message: offerFields.message });

const roleOf = (req) => req.user.role; // 'buyer' | 'farmer'
const other = (role) => (role === 'buyer' ? 'farmer' : 'buyer');

// Requests visible to the logged-in user (as buyer or farmer), 404 for anyone else
async function ownRequest(req, session) {
  const mine = roleOf(req) === 'farmer' ? { farmer: req.user._id } : { buyer: req.user._id };
  const q = PurchaseRequest.findOne({ _id: req.params.id, ...mine });
  if (session) q.session(session);
  const pr = await q;
  if (!pr) throw new AppError('Request not found', 404);
  return pr;
}

const assertOpen = (pr) => {
  if (!pr.isOpen) throw new AppError(`This request is already ${pr.status}`, 409);
};
const assertMyTurn = (pr, role) => {
  if (pr.turn !== role) throw new AppError(`Waiting for the ${pr.turn} to respond`, 409);
};
const rounds = (pr) => pr.history.filter((h) => h.action === 'offer' || h.action === 'counter').length;

// Quantity rules shared by new offers and counter-offers
function assertQuantityOk(listing, quantity) {
  if (listing.minOrderQty && quantity < listing.minOrderQty) throw new AppError(`Minimum order is ${listing.minOrderQty} kg`, 400);
  if (quantity > listing.availableQty) throw new AppError(`Only ${listing.availableQty} kg is available`, 400);
}

// What each side may see. Phone numbers are revealed only after the request is accepted.
async function shape(pr, role) {
  await pr.populate([
    { path: 'listing', select: 'crop expectedPrice availableQty status village district minOrderQty' },
    { path: 'buyer', select: 'name phone buyerType businessName' },
    { path: 'farmer', select: 'name phone' },
  ]);
  const accepted = pr.status === 'accepted';
  const counterpart =
    role === 'farmer'
      ? { name: pr.buyer.name, detail: [pr.buyer.buyerType, pr.buyer.businessName].filter(Boolean).join(' · '), phone: accepted ? pr.buyer.phone : undefined }
      : { name: pr.farmer.name, detail: `${pr.listing.village}, ${pr.listing.district}`, phone: accepted ? pr.farmer.phone : undefined };

  const order = accepted ? await Order.findOne({ request: pr._id }, '_id').lean() : null;
  counterpart.rating = await ratingOf(role === 'farmer' ? pr.buyer._id : pr.farmer._id);
  const { buyer, farmer, ...rest } = pr.toObject();
  return { ...rest, counterpart, orderId: order?._id ?? null, myTurn: pr.isOpen && pr.turn === role };
}

// Trade done: tell every verified transporter whose vehicle can carry it, so they can offer to take the transport
export async function notifyTransportersOfTrade(crop, quantity) {
  const fit = await User.find({ role: 'transporter', verificationStatus: 'verified', isActive: true, isAvailable: { $ne: false }, vehicleCapacityKg: { $gte: quantity } }, '_id').limit(200).lean();
  await notifyMany(fit.map((u) => u._id), { type: 'transport', title: 'A trade needs transport', message: `${kg(quantity)} of ${crop} was sold. Send your offer to move it.`, link: '/transporter/requests?tab=trades' });
}

export const createRequest = asyncHandler(async (req, res) => {
  const data = createSchema.parse(req.body);
  const listing = await CropListing.findOne({ _id: data.listingId, ...liveFilter() });
  if (!listing) throw new AppError('This listing is no longer available', 404);
  assertQuantityOk(listing, data.quantity);
  const transport = resolveTransport(data);

  let pr;
  try {
    pr = await PurchaseRequest.create({
      listing: listing._id,
      farmer: listing.farmer,
      buyer: req.user._id,
      crop: listing.crop,
      askingPrice: listing.expectedPrice,
      quantity: data.quantity,
      price: data.price,
      ...transport,
      turn: 'farmer',
      message: data.message,
      neededBy: data.neededBy,
      history: [{ by: 'buyer', action: 'offer', price: data.price, quantity: data.quantity, transportBy: transport.transportBy, transportCharge: transport.transportCharge, message: data.message }],
    });
  } catch (err) {
    if (err.code === 11000) throw new AppError('You already have an open request for this listing', 409);
    throw err;
  }
  await notify(pr.farmer, { type: 'request', title: 'New purchase request', message: `${req.user.name} wants ${kg(data.quantity)} of ${pr.crop} at ${inr(data.price)}/kg`, link: `/farmer/requests/${pr._id}` });
  res.status(201).json({ request: await shape(pr, 'buyer') });
});

export const myRequests = asyncHandler(async (req, res) => {
  const role = roleOf(req);
  const mine = role === 'farmer' ? { farmer: req.user._id } : { buyer: req.user._id };
  const tab = req.query.tab;
  const filter = { ...mine, ...(tab === 'open' && { isOpen: true }), ...(tab === 'accepted' && { status: 'accepted' }), ...(tab === 'closed' && { status: { $in: ['rejected', 'cancelled'] } }) };

  const [docs, grouped] = await Promise.all([
    PurchaseRequest.find(filter).sort({ updatedAt: -1 }),
    PurchaseRequest.aggregate([{ $match: mine }, { $group: { _id: '$status', n: { $sum: 1 } } }]),
  ]);
  const by = Object.fromEntries(grouped.map((g) => [g._id, g.n]));
  const counts = {
    open: (by.requested ?? 0) + (by.negotiating ?? 0),
    accepted: by.accepted ?? 0,
    closed: (by.rejected ?? 0) + (by.cancelled ?? 0),
  };
  const [requests] = [await Promise.all(docs.map((d) => shape(d, role)))];
  // "needs your reply" count for the dashboard badge
  const needsReply = requests.filter((r) => r.myTurn).length;
  res.json({ requests, counts, needsReply: tab ? undefined : needsReply });
});

export const getRequest = asyncHandler(async (req, res) => {
  const pr = await ownRequest(req);
  res.json({ request: await shape(pr, roleOf(req)) });
});

export const counter = asyncHandler(async (req, res) => {
  const role = roleOf(req);
  const data = counterSchema.parse(req.body);
  const pr = await ownRequest(req);
  assertOpen(pr);
  assertMyTurn(pr, role);
  if (rounds(pr) >= MAX_ROUNDS) throw new AppError('Negotiation limit reached. Please accept or reject the current offer.', 400);

  const quantity = data.quantity ?? pr.quantity;
  const listing = await CropListing.findOne({ _id: pr.listing, ...liveFilter() });
  if (!listing) throw new AppError('This listing is no longer available', 409);
  assertQuantityOk(listing, quantity);
  const transport = resolveTransport(data, pr);

  // The write only succeeds if the request is still open and still waiting on this user
  const updated = await PurchaseRequest.findOneAndUpdate(
    { _id: pr._id, isOpen: true, turn: role },
    {
      $set: { quantity, price: data.price, ...transport, status: 'negotiating', turn: other(role) },
      $push: { history: { by: role, action: 'counter', price: data.price, quantity, transportBy: transport.transportBy, transportCharge: transport.transportCharge, message: data.message, at: new Date() } },
    },
    { new: true }
  );
  if (!updated) throw new AppError('This request was just updated. Refresh and try again.', 409);
  const them = role === 'farmer' ? updated.buyer : updated.farmer;
  await notify(them, { type: 'request', title: 'Counter offer received', message: `${req.user.name} countered: ${kg(updated.quantity)} of ${updated.crop} at ${inr(updated.price)}/kg`, link: `/${other(role)}/requests/${updated._id}` });
  res.json({ request: await shape(updated, role) });
});

export const accept = asyncHandler(async (req, res) => {
  const role = roleOf(req);
  const session = await mongoose.startSession();
  let result;
  try {
    // Stock reservation and request update succeed or fail together
    await session.withTransaction(async () => {
      const pr = await ownRequest(req, session);
      assertOpen(pr);
      assertMyTurn(pr, role);

      const listing = await CropListing.findOneAndUpdate(
        { _id: pr.listing, ...liveFilter(), availableQty: { $gte: pr.quantity } },
        { $inc: { availableQty: -pr.quantity } },
        { new: true, session }
      );
      if (!listing) throw new AppError('Not enough stock left for this quantity, or the listing is no longer live', 409);

      listing.status = listing.availableQty <= 0 ? 'sold_out' : 'partially_sold';
      await listing.save({ session });

      pr.status = 'accepted';
      pr.isOpen = false;
      pr.turn = undefined;
      pr.finalPrice = pr.price;
      pr.finalQuantity = pr.quantity;
      pr.acceptedAt = new Date();
      pr.history.push({ by: role, action: 'accept', price: pr.price, quantity: pr.quantity, at: new Date() });
      await pr.save({ session });

      // The agreed deal becomes an order, in the same transaction as the stock reservation
      await Order.create(
        [
          {
            request: pr._id,
            listing: pr.listing,
            farmer: pr.farmer,
            buyer: pr.buyer,
            crop: pr.crop,
            quantity: pr.quantity,
            price: pr.price,
            total: pr.quantity * pr.price,
            transportBy: pr.transportBy ?? 'buyer',
            ratePerKm: pr.ratePerKm,
            distanceKm: pr.distanceKm,
            transportCharge: pr.transportBy === 'farmer' ? pr.transportCharge ?? 0 : 0,
            grandTotal: pr.quantity * pr.price + (pr.transportBy === 'farmer' ? pr.transportCharge ?? 0 : 0),
            timeline: [{ status: 'confirmed', by: 'system' }],
          },
        ],
        { session }
      );
      result = pr;
    });
  } finally {
    await session.endSession();
  }
  const them = role === 'farmer' ? result.buyer : result.farmer;
  const shaped = await shape(result, role);
  await notify(them, { type: 'order', title: 'Offer accepted, order confirmed', message: `${req.user.name} accepted ${kg(result.finalQuantity)} of ${result.crop} at ${inr(result.finalPrice)}/kg`, link: shaped.orderId ? `/${other(role)}/orders/${shaped.orderId}` : `/${other(role)}/requests/${result._id}` });
  // Trade done: tell every verified transporter whose vehicle can carry it, so they can offer to take the transport
  if (shaped.orderId) await notifyTransportersOfTrade(result.crop, result.finalQuantity);
  res.json({ request: shaped });
});

// Farmer declines; buyer withdraws. Either can close while the request is open.
async function close(req, res, status, actor) {
  const role = roleOf(req);
  if (role !== actor) throw new AppError('Forbidden', 403);
  const { message } = reasonSchema.parse(req.body ?? {});
  const pr = await ownRequest(req);
  assertOpen(pr);

  const updated = await PurchaseRequest.findOneAndUpdate(
    { _id: pr._id, isOpen: true },
    {
      $set: { status, isOpen: false },
      $unset: { turn: '' },
      $push: { history: { by: role, action: status === 'rejected' ? 'reject' : 'cancel', message, at: new Date() } },
    },
    { new: true }
  );
  if (!updated) throw new AppError('This request was just updated. Refresh and try again.', 409);
  const them = role === 'farmer' ? updated.buyer : updated.farmer;
  await notify(them, { type: 'request', title: status === 'rejected' ? 'Request declined' : 'Request cancelled', message: `${req.user.name} ${status === 'rejected' ? 'declined' : 'cancelled'} the request for ${updated.crop}${message ? `: “${message}”` : ''}`, link: `/${other(role)}/requests/${updated._id}` });
  res.json({ request: await shape(updated, role) });
}

export const reject = asyncHandler((req, res) => close(req, res, 'rejected', 'farmer'));
export const cancel = asyncHandler((req, res) => close(req, res, 'cancelled', 'buyer'));
