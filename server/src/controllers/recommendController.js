import CropListing from '../models/CropListing.js';
import PurchaseRequest from '../models/PurchaseRequest.js';
import Order from '../models/Order.js';
import User from '../models/User.js';
import Notification from '../models/Notification.js';
import { AppError, asyncHandler } from '../utils/AppError.js';
import { liveFilter } from '../utils/listing.js';
import { notify } from '../services/notify.js';

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const DAY = 864e5;
const HISTORY_DAYS = 180;
const clamp01 = (n) => Math.max(0, Math.min(1, n));

// Rule-based buyer matching (no machine learning): every score is a weighted sum of simple, explainable signals.
const WEIGHTS = { history: 0.3, price: 0.25, quantity: 0.2, reliability: 0.15, recency: 0.1 };

async function ownLiveListing(req) {
  const listing = await CropListing.findOne({ _id: req.params.id, farmer: req.user._id, ...liveFilter() });
  if (!listing) throw new AppError('Only your live listings have suggested buyers', 404);
  return listing;
}

export async function scoreBuyers(listing) {
  const since = new Date(Date.now() - HISTORY_DAYS * DAY);
  const crop = { $regex: `^${escapeRegex(listing.crop)}$`, $options: 'i' };

  const [orders, requests, reliability, open] = await Promise.all([
    Order.aggregate([
      { $match: { crop, createdAt: { $gte: since }, status: { $ne: 'cancelled' } } },
      { $group: { _id: '$buyer', n: { $sum: 1 }, kg: { $sum: '$quantity' }, value: { $sum: '$total' }, last: { $max: '$createdAt' } } },
    ]),
    PurchaseRequest.aggregate([
      { $match: { crop, createdAt: { $gte: since }, status: { $in: ['requested', 'negotiating', 'accepted', 'rejected'] } } },
      { $group: { _id: '$buyer', n: { $sum: 1 }, avgQty: { $avg: '$quantity' }, avgPrice: { $avg: '$price' }, last: { $max: '$createdAt' } } },
    ]),
    Order.aggregate([
      { $group: { _id: '$buyer', done: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } }, dropped: { $sum: { $cond: [{ $and: [{ $eq: ['$status', 'cancelled'] }, { $eq: ['$cancelledBy', 'buyer'] }] }, 1, 0] } } } },
    ]),
    PurchaseRequest.find({ listing: listing._id, isOpen: true }, 'buyer').lean(),
  ]);

  const stats = new Map();
  const slot = (id) => stats.get(String(id)) ?? stats.set(String(id), { n: 0, kg: 0, value: 0, qtySamples: 0, priceSum: 0, priceN: 0, last: 0 }).get(String(id));
  for (const o of orders) {
    const s = slot(o._id);
    s.n += o.n; s.kg += o.kg; s.qtySamples += o.n; s.priceSum += o.value; s.priceN += o.kg; // price weighted by kg
    s.last = Math.max(s.last, +o.last);
  }
  for (const r of requests) {
    const s = slot(r._id);
    s.n += r.n; s.kg += r.avgQty * r.n; s.qtySamples += r.n;
    if (!s.priceN) { s.priceSum += r.avgPrice; s.priceN += 1; } // only used when they have no completed price history
    s.last = Math.max(s.last, +r.last);
  }

  const rel = new Map(reliability.map((r) => [String(r._id), r.done + r.dropped ? r.done / (r.done + r.dropped) : null]));
  const excluded = new Set(open.map((r) => String(r.buyer)));
  const buyers = await User.find({ _id: { $in: [...stats.keys()] }, role: 'buyer', verificationStatus: 'verified', isActive: true }, 'name buyerType businessName').lean();

  return buyers
    .filter((b) => !excluded.has(String(b._id)))
    .map((b) => {
      const s = stats.get(String(b._id));
      const avgQty = s.kg / s.qtySamples;
      const avgPrice = s.priceSum / s.priceN;
      const reliabilityRate = rel.get(String(b._id)) ?? 0.7; // no history: assume a modest default
      const daysAgo = (Date.now() - s.last) / DAY;

      const parts = {
        history: clamp01(s.n / 5),
        price: clamp01(avgPrice / listing.expectedPrice),
        quantity: 1 - clamp01(Math.abs(avgQty - listing.availableQty) / Math.max(avgQty, listing.availableQty)),
        reliability: reliabilityRate,
        recency: clamp01(1 - daysAgo / HISTORY_DAYS),
      };
      const score = Math.round(Object.entries(WEIGHTS).reduce((sum, [k, w]) => sum + parts[k] * w, 0) * 100);
      const reasons = [
        `Asked for or bought ${listing.crop} ${s.n} time${s.n === 1 ? '' : 's'} recently`,
        `Usually wants about ${Math.round(avgQty).toLocaleString('en-IN')} kg`,
        `Typically offers around ₹${Math.round(avgPrice * 10) / 10}/kg (your price ₹${listing.expectedPrice})`,
        rel.get(String(b._id)) != null ? `${Math.round(reliabilityRate * 100)}% of their orders were completed` : 'New buyer with no order history yet',
      ];
      return { buyerId: b._id, name: b.name, buyerType: b.buyerType, businessName: b.businessName, score, reasons };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
}

export const recommend = asyncHandler(async (req, res) => {
  const listing = await ownLiveListing(req);
  const buyers = await scoreBuyers(listing);

  const recent = await Notification.find({ type: 'match', link: `/buyer/marketplace/${listing._id}`, createdAt: { $gte: new Date(Date.now() - DAY) } }, 'user').lean();
  const told = new Set(recent.map((n) => String(n.user)));
  res.json({ buyers: buyers.map((b) => ({ ...b, notified: told.has(String(b.buyerId)) })), method: 'rule-based', weights: WEIGHTS });
});

// The farmer cannot see a buyer's contact details. This sends the buyer a heads-up; the buyer decides whether to act.
export const notifyBuyer = asyncHandler(async (req, res) => {
  const listing = await ownLiveListing(req);
  const buyer = await User.findOne({ _id: req.params.buyerId, role: 'buyer', verificationStatus: 'verified', isActive: true }, 'name');
  if (!buyer) throw new AppError('Buyer not found', 404);

  const link = `/buyer/marketplace/${listing._id}`;
  const already = await Notification.exists({ user: buyer._id, type: 'match', link, createdAt: { $gte: new Date(Date.now() - DAY) } });
  if (already) throw new AppError('This buyer was already told about this listing today', 409);

  await notify(buyer._id, {
    type: 'match',
    title: 'A listing matches your past purchases',
    message: `${req.user.name} has ${listing.availableQty.toLocaleString('en-IN')} kg of ${listing.crop} at ₹${listing.expectedPrice}/kg`,
    link,
  });
  res.json({ message: 'Buyer notified' });
});
