import mongoose from 'mongoose';
import Rating from '../models/Rating.js';
import Order from '../models/Order.js';

/** Average stars and count for each user id: Map<idString, { avg, count }>. Users without ratings are absent. */
export async function reputation(userIds) {
  const ids = [...new Set(userIds.filter(Boolean).map(String))];
  if (!ids.length) return new Map();
  const rows = await Rating.aggregate([
    { $match: { to: { $in: ids.map((i) => new mongoose.Types.ObjectId(i)) } } },
    { $group: { _id: '$to', avg: { $avg: '$stars' }, count: { $sum: 1 } } },
  ]);
  return new Map(rows.map((r) => [String(r._id), { avg: Math.round(r.avg * 10) / 10, count: r.count }]));
}

export const ratingOf = async (userId) => (await reputation([userId])).get(String(userId)) ?? null;

// Before general ratings existed, a buyer's rating of the farmer lived on the order. Copy those over once (safe to re-run).
export async function backfillLegacyRatings() {
  const old = await Order.find({ 'rating.stars': { $exists: true } }, 'farmer buyer rating').lean();
  if (!old.length) return 0;
  const ops = old.map((o) => ({
    updateOne: {
      filter: { order: o._id, from: o.buyer, to: o.farmer },
      update: { $setOnInsert: { fromRole: 'buyer', toRole: 'farmer', stars: o.rating.stars, comment: o.rating.comment } },
      upsert: true,
    },
  }));
  const res = await Rating.bulkWrite(ops);
  return res.upsertedCount;
}
