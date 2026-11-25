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
  // Farmers have a FarmerProfile with their district; buyers use the district from the query or their User profile
  const profile = req.user.role === 'farmer'
    ? await FarmerProfile.findOne({ user: req.user._id }, 'district').lean()
    : null;
  const fromDistrict = normalizeDistrict(q.from ?? profile?.district ?? req.user.district);
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

// ── Nearby markets: all markets for a crop sorted by distance from farmer's district ──
export const nearby = asyncHandler(async (req, res) => {
  const q = z.object({
    crop: z.string().trim().min(2).max(60),
    quantity: z.coerce.number().positive().max(1_000_000).default(1000),
    from: z.string().trim().max(60).optional(),
    days: z.coerce.number().int().min(1).max(30).default(7),
    ratePerKm: z.coerce.number().min(1).max(200).default(12),
    vehicleKg: z.coerce.number().min(100).max(30000).default(1000),
  }).parse(req.query);

  const profile = req.user.role === 'farmer'
    ? await FarmerProfile.findOne({ user: req.user._id }, 'district village').lean()
    : null;
  const profileDistrict = normalizeDistrict(profile?.district);
  const farmerDistrict = normalizeDistrict(q.from) ?? profileDistrict;
  const isCustomLocation = Boolean(q.from && normalizeDistrict(q.from) && normalizeDistrict(q.from) !== profileDistrict);
  const key = q.crop.toLowerCase();
  const opts = { ratePerKm: q.ratePerKm, vehicleKg: q.vehicleKg };

  const rows = await latestPerMarket(key);

  // Per-market daily trend for the requested window (sparkline + weekly analysis)
  const trendAgg = await MarketPrice.aggregate([
    { $match: { cropKey: key, date: { $gte: since(q.days) } } },
    { $group: { _id: { market: '$market', date: '$date' }, price: { $avg: '$modalPrice' } } },
    { $sort: { '_id.date': 1 } },
    { $group: { _id: '$_id.market', trend: { $push: { date: '$_id.date', price: '$price' } } } },
  ]);
  const trendMap = Object.fromEntries(trendAgg.map((t) => [t._id, t.trend]));

  const markets = rows.map((r) => {
    const distanceKm = farmerDistrict ? roadDistanceKm(farmerDistrict, r.district) : null;
    const transport = transportCost(distanceKm, q.quantity, opts);
    const gross = round(q.quantity * r.modalPrice, 0);
    const net = transport == null ? null : round(gross - transport, 0);
    const trend = trendMap[r.market] ?? [];
    const trendPct = trend.length >= 2
      ? round(((trend[trend.length - 1].price - trend[0].price) / trend[0].price) * 100, 1)
      : null;
    const distCoords = AP_DISTRICTS[normalizeDistrict(r.district)] ?? null;
    return {
      market: r.market, district: r.district, minPrice: r.minPrice,
      modalPrice: r.modalPrice, maxPrice: r.maxPrice, date: r.date, source: r.source,
      distanceKm, transportCost: transport, grossRevenue: gross, netRevenue: net,
      trend, trendPct, coords: distCoords,
    };
  });

  const byValue = [...markets].sort((a, b) => (b.netRevenue ?? -Infinity) - (a.netRevenue ?? -Infinity));
  const byDistance = [...markets].filter((m) => m.distanceKm != null).sort((a, b) => a.distanceKm - b.distanceKm);
  const bestValue = byValue.find((m) => m.netRevenue != null) ?? null;
  const nearest = byDistance[0] ?? null;
  const top3 = byValue.filter((m) => m.netRevenue != null).slice(0, 3);
  const smartPick = top3.length
    ? top3.reduce((a, b) => ((a.distanceKm ?? Infinity) <= (b.distanceKm ?? Infinity) ? a : b))
    : bestValue;

  const risingCount = markets.filter((m) => (m.trendPct ?? 0) > 2).length;
  const fallingCount = markets.filter((m) => (m.trendPct ?? 0) < -2).length;
  const avgModal = markets.length ? round(markets.reduce((s, m) => s + m.modalPrice, 0) / markets.length, 2) : null;

  res.json({
    crop: q.crop,
    quantity: q.quantity,
    farmerDistrict,
    profileDistrict,
    isCustomLocation,
    village: profile?.village ?? null,
    days: q.days,
    markets: byValue,
    byDistance,
    recommendation: {
      bestValue: bestValue && { market: bestValue.market, district: bestValue.district, netRevenue: bestValue.netRevenue, distanceKm: bestValue.distanceKm, reason: 'Highest net revenue after transport cost' },
      nearest: nearest && { market: nearest.market, district: nearest.district, netRevenue: nearest.netRevenue, distanceKm: nearest.distanceKm, reason: 'Closest market to your location' },
      smartPick: smartPick && { market: smartPick.market, district: smartPick.district, netRevenue: smartPick.netRevenue, distanceKm: smartPick.distanceKm, reason: 'Best balance of price and distance' },
    },
    weeklyInsights: { risingCount, fallingCount, totalMarkets: markets.length, avgModal },
  });
});

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
