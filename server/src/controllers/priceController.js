import { z } from 'zod';
import MarketPrice from '../models/MarketPrice.js';
import Order from '../models/Order.js';
import CropListing from '../models/CropListing.js';
import FarmerProfile from '../models/FarmerProfile.js';
import { asyncHandler } from '../utils/AppError.js';
import { AP_DISTRICTS, normalizeDistrict, roadDistanceKm } from '../utils/geo.js';
import { liveFilter } from '../utils/listing.js';

const FRESH_DAYS = 14; // price rows older than this are not used for comparison
const STALE_AFTER_DAYS = 3; // warn when the newest price is older than this
const BASE_TRIP = 200; // minimum charge for one vehicle trip (₹)
const day = 864e5;

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const exact = (crop) => ({ $regex: `^${escapeRegex(crop.trim())}$`, $options: 'i' });
const round = (n, d = 2) => Math.round(n * 10 ** d) / 10 ** d;
const since = (days) => new Date(Date.now() - days * day);

const compareSchema = z.object({
  crop: z.string().trim().min(2).max(60),
  quantity: z.coerce.number().positive().max(1_000_000).default(1000),
  from: z.string().trim().max(60).optional(), // farmer's district
  ratePerKm: z.coerce.number().min(1).max(200).default(12), // ₹ per km per vehicle
  vehicleKg: z.coerce.number().min(100).max(30000).default(1000),
});

// Transport estimate: whole vehicles needed x (distance x rate), never below the minimum trip charge
export function transportCost(distanceKm, quantity, { ratePerKm, vehicleKg }) {
  if (distanceKm == null) return null;
  const vehicles = Math.ceil(quantity / vehicleKg);
  return round(vehicles * Math.max(BASE_TRIP, distanceKm * ratePerKm), 0);
}

// Latest observation per market inside the freshness window
async function latestPerMarket(cropFilter) {
  return MarketPrice.aggregate([
    { $match: { cropKey: cropFilter, date: { $gte: since(FRESH_DAYS) } } },
    { $sort: { date: -1, source: 1 } },
    { $group: { _id: { market: '$market', district: '$district' }, doc: { $first: '$$ROOT' } } },
    { $replaceRoot: { newRoot: '$doc' } },
  ]);
}

export const compare = asyncHandler(async (req, res) => {
  const q = compareSchema.parse(req.query);
  const profile = await FarmerProfile.findOne({ user: req.user._id }, 'district').lean();
  const fromDistrict = normalizeDistrict(q.from ?? profile?.district);
  const key = q.crop.toLowerCase();
  const opts = { ratePerKm: q.ratePerKm, vehicleKg: q.vehicleKg };

  const rows = await latestPerMarket(key);
  const markets = rows.map((r) => {
    const distanceKm = fromDistrict ? roadDistanceKm(fromDistrict, r.district) : null;
    const transport = transportCost(distanceKm, q.quantity, opts);
    const gross = round(q.quantity * r.modalPrice, 0);
    return {
      market: r.market,
      district: r.district,
      variety: r.variety,
      minPrice: r.minPrice,
      modalPrice: r.modalPrice,
      maxPrice: r.maxPrice,
      date: r.date,
      ageDays: Math.floor((Date.now() - r.date) / day),
      source: r.source,
      distanceKm,
      transportCost: transport,
      grossRevenue: gross,
      netRevenue: transport == null ? null : round(gross - transport, 0),
    };
  });
  // Best net revenue first. Markets whose distance is unknown go last.
  markets.sort((a, b) => (b.netRevenue ?? -Infinity) - (a.netRevenue ?? -Infinity) || b.modalPrice - a.modalPrice);
  const best = markets.find((m) => m.netRevenue != null) ?? null;

  const newest = markets.reduce((d, m) => (!d || m.date > d ? m.date : d), null);

  // What FarmLink users themselves are paying and asking right now
  const cropRe = exact(q.crop);
  const [orders, listings] = await Promise.all([
    Order.aggregate([
      { $match: { crop: cropRe, status: { $ne: 'cancelled' }, createdAt: { $gte: since(30) } } },
      { $group: { _id: null, qty: { $sum: '$quantity' }, value: { $sum: '$total' }, n: { $sum: 1 } } },
    ]),
    CropListing.aggregate([{ $match: { crop: cropRe, ...liveFilter() } }, { $group: { _id: null, avg: { $avg: '$expectedPrice' }, n: { $sum: 1 } } }]),
  ]);

  res.json({
    crop: q.crop,
    quantity: q.quantity,
    fromDistrict,
    assumptions: { ratePerKm: q.ratePerKm, vehicleKg: q.vehicleKg, minTripCharge: BASE_TRIP, freshDays: FRESH_DAYS },
    markets,
    best: best && { market: best.market, netRevenue: best.netRevenue },
    newestDate: newest,
    stale: newest ? Date.now() - newest > STALE_AFTER_DAYS * day : null,
    platform: {
      orders: orders[0] ? { avgPrice: round(orders[0].value / orders[0].qty), orders: orders[0].n, quantity: orders[0].qty } : null,
      listings: listings[0] ? { avgPrice: round(listings[0].avg), listings: listings[0].n } : null,
    },
  });
});

// Daily average modal price (all markets, or one market) for a trend chart
export const trend = asyncHandler(async (req, res) => {
  const q = z.object({ crop: z.string().trim().min(2).max(60), market: z.string().trim().max(80).optional(), days: z.coerce.number().int().min(7).max(180).default(30) }).parse(req.query);
  const rows = await MarketPrice.aggregate([
    { $match: { cropKey: q.crop.toLowerCase(), date: { $gte: since(q.days) }, ...(q.market && { market: q.market }) } },
    { $group: { _id: '$date', price: { $avg: '$modalPrice' }, markets: { $sum: 1 } } },
    { $sort: { _id: 1 } },
  ]);
  res.json({ crop: q.crop, market: q.market ?? null, points: rows.map((r) => ({ date: r._id, price: round(r.price), markets: r.markets })) });
});

// Reference range shown next to the price field on the listing form
export const suggest = asyncHandler(async (req, res) => {
  const { crop } = z.object({ crop: z.string().trim().min(2).max(60) }).parse(req.query);
  const rows = await latestPerMarket({ $regex: escapeRegex(crop.toLowerCase()) });
  if (!rows.length) return res.json({ reference: null });

  const prices = rows.map((r) => r.modalPrice).sort((a, b) => a - b);
  const mid = Math.floor(prices.length / 2);
  const median = prices.length % 2 ? prices[mid] : (prices[mid - 1] + prices[mid]) / 2;
  const newest = rows.reduce((d, r) => (r.date > d ? r.date : d), rows[0].date);
  res.json({
    reference: {
      low: prices[0],
      high: prices[prices.length - 1],
      median: round(median),
      markets: rows.length,
      date: newest,
      sources: [...new Set(rows.map((r) => r.source))],
    },
  });
});

export const crops = asyncHandler(async (_req, res) => {
  const rows = await MarketPrice.aggregate([
    { $match: { date: { $gte: since(30) } } },
    { $group: { _id: '$cropKey', crop: { $first: '$crop' }, markets: { $addToSet: '$market' } } },
    { $sort: { crop: 1 } },
  ]);
  res.json({ crops: rows.map((r) => ({ crop: r.crop, markets: r.markets.length })) });
});

export const districts = (_req, res) => res.json({ districts: Object.keys(AP_DISTRICTS).sort() });

// Rule-based "when to sell" from the last 60 days of mandi prices. History, not a forecast.
const dailyAverages = (match) =>
  MarketPrice.aggregate([{ $match: match }, { $group: { _id: '$date', price: { $avg: '$modalPrice' } } }, { $sort: { _id: 1 } }]);

export const outlook = asyncHandler(async (req, res) => {
  const q = z.object({ crop: z.string().trim().min(2).max(60), district: z.string().trim().max(60).optional() }).parse(req.query);
  const base = { cropKey: q.crop.toLowerCase(), date: { $gte: since(60) } };
  let rows = q.district ? await dailyAverages({ ...base, district: exact(q.district) }) : [];
  const local = rows.length >= 5;
  if (!local) rows = await dailyAverages(base); // too little data in the district: use every market

  const scope = local ? q.district : null;
  if (rows.length < 5) return res.json({ crop: q.crop, scope, days: rows.length, verdict: null });

  const pts = rows.map((r) => ({ date: r._id, price: r.price }));
  const latest = pts.slice(-3).reduce((s, p) => s + p.price, 0) / Math.min(3, pts.length);
  const last30 = pts.filter((p) => p.date >= since(30));
  const avg30 = last30.reduce((s, p) => s + p.price, 0) / last30.length;
  const ratio = latest / avg30;
  const verdict = ratio >= 1.05 ? 'good' : ratio <= 0.95 ? 'low' : 'normal';

  // Best weekday: needs about three weeks of history and at least two sightings of each weekday
  // Each day is compared with the average of the days around it, so a rising or falling market is not mistaken for a weekday habit.
  // A weekday only counts if it beat its surroundings by 3% on average AND on most of its days.
  const spanDays = (pts.at(-1).date - pts[0].date) / day;
  const byDay = Array.from({ length: 7 }, () => []);
  pts.forEach((p, i) => {
    const near = pts.slice(Math.max(0, i - 3), i + 4);
    byDay[new Date(p.date).getUTCDay()].push(p.price / (near.reduce((s, q) => s + q.price, 0) / near.length));
  });
  let bestWeekday = null;
  if (spanDays >= 20 && byDay.every((d) => d.length >= 2)) {
    const means = byDay.map((d) => d.reduce((s, v) => s + v, 0) / d.length);
    const best = means.indexOf(Math.max(...means));
    const uplift = means[best] - 1;
    const consistent = byDay[best].filter((v) => v > 1.01).length / byDay[best].length >= 0.7;
    if (uplift >= 0.03 && consistent) bestWeekday = { day: best, upliftPct: round(uplift * 100, 1) };
  }

  res.json({
    crop: q.crop,
    scope,
    days: pts.length,
    verdict,
    latest: round(latest),
    avg30: round(avg30),
    min30: round(Math.min(...last30.map((p) => p.price))),
    max30: round(Math.max(...last30.map((p) => p.price))),
    changePct: round((ratio - 1) * 100, 1),
    bestWeekday,
  });
});
