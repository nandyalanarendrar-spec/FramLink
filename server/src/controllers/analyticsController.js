import PurchaseRequest from '../models/PurchaseRequest.js';
import CropListing from '../models/CropListing.js';
import { asyncHandler } from '../utils/AppError.js';
import { liveFilter } from '../utils/listing.js';

const WINDOW_DAYS = 30;

// Demand = kg buyers asked for on FarmLink in the last 30 days. Supply = kg farmers have for sale right now.
// This is FarmLink's own activity, not the whole market.
export const demandSupply = asyncHandler(async (_req, res) => {
  const since = new Date(Date.now() - WINDOW_DAYS * 864e5);

  const [supply, demand, districts] = await Promise.all([
    CropListing.aggregate([
      { $match: liveFilter() },
      { $group: { _id: { $toLower: '$crop' }, crop: { $first: '$crop' }, supplyKg: { $sum: '$availableQty' }, listings: { $sum: 1 }, avgAskPrice: { $avg: '$expectedPrice' } } },
    ]),
    PurchaseRequest.aggregate([
      { $match: { createdAt: { $gte: since }, status: { $in: ['requested', 'negotiating', 'accepted'] } } },
      { $group: { _id: { $toLower: '$crop' }, crop: { $first: '$crop' }, demandKg: { $sum: '$quantity' }, requests: { $sum: 1 }, avgOfferPrice: { $avg: '$price' } } },
    ]),
    PurchaseRequest.aggregate([
      { $match: { createdAt: { $gte: since }, status: { $ne: 'cancelled' } } },
      { $lookup: { from: 'croplistings', localField: 'listing', foreignField: '_id', as: 'l', pipeline: [{ $project: { district: 1 } }] } },
      { $unwind: '$l' },
      { $group: { _id: { $toLower: '$l.district' }, district: { $first: '$l.district' }, requests: { $sum: 1 } } },
      { $sort: { requests: -1 } },
      { $limit: 5 },
    ]),
  ]);

  const map = new Map();
  for (const s of supply) map.set(s._id, { crop: s.crop, supplyKg: s.supplyKg, listings: s.listings, avgAskPrice: s.avgAskPrice, demandKg: 0, requests: 0, avgOfferPrice: null });
  for (const d of demand) {
    const row = map.get(d._id) ?? { crop: d.crop, supplyKg: 0, listings: 0, avgAskPrice: null };
    map.set(d._id, { ...row, demandKg: d.demandKg, requests: d.requests, avgOfferPrice: d.avgOfferPrice });
  }

  const round = (n) => (n == null ? null : Math.round(n * 100) / 100);
  const crops = [...map.values()]
    .map((c) => {
      let status = 'balanced';
      if (c.supplyKg === 0 && c.demandKg > 0) status = 'no_stock';
      else if (c.demandKg === 0) status = 'no_demand';
      else if (c.demandKg / c.supplyKg >= 1.5) status = 'high_demand';
      else if (c.demandKg / c.supplyKg <= 0.5) status = 'surplus';
      return { ...c, avgAskPrice: round(c.avgAskPrice), avgOfferPrice: round(c.avgOfferPrice), status };
    })
    .sort((a, b) => b.demandKg + b.supplyKg - (a.demandKg + a.supplyKg));

  res.json({ windowDays: WINDOW_DAYS, crops, districts: districts.map((d) => ({ district: d.district, requests: d.requests })) });
});
