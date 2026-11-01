import User from '../models/User.js';
import TransportRequest from '../models/TransportRequest.js';
import { asyncHandler } from '../utils/AppError.js';
import { reputation } from '../services/ratings.js';

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const str = (v, max = 60) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

// Plates are shown as e.g. "AP02••••" so they are not public. Phone numbers are never listed.
const maskPlate = (p = '') => (p.length > 4 ? `${p.slice(0, 4)}••••` : p);

// The vehicle list farmers and buyers browse, like the crop marketplace
export const directory = asyncHandler(async (req, res) => {
  const q = str(req.query.q);
  const type = str(req.query.type, 40);
  const minCapacity = Number(req.query.minCapacity);
  const filter = { role: 'transporter', verificationStatus: 'verified', isActive: true, isAvailable: { $ne: false }, vehicleCapacityKg: { $gt: 0 } };
  if (type) filter.vehicleType = { $regex: `^${escapeRegex(type)}$`, $options: 'i' };
  if (minCapacity > 0) filter.vehicleCapacityKg = { $gte: minCapacity };
  if (q) filter.$or = [{ serviceArea: { $regex: escapeRegex(q), $options: 'i' } }, { name: { $regex: escapeRegex(q), $options: 'i' } }, { vehicleType: { $regex: escapeRegex(q), $options: 'i' } }];

  const sort = req.query.sort === 'capacity' ? { vehicleCapacityKg: -1 } : req.query.sort === 'price' ? { ratePerKm: 1 } : { createdAt: -1 };
  const vehicles = await User.find(filter, 'name vehicleType vehicleNumber vehicleCapacityKg ratePerKm serviceArea createdAt').sort(sort).limit(60).lean();

  const trips = await TransportRequest.aggregate([
    { $match: { transporter: { $in: vehicles.map((v) => v._id) }, status: 'delivered' } },
    { $group: { _id: '$transporter', trips: { $sum: 1 } } },
  ]);
  const tripsBy = new Map(trips.map((t) => [String(t._id), t.trips]));
  const scores = await reputation(vehicles.map((v) => v._id));
  const types = await User.distinct('vehicleType', { role: 'transporter', verificationStatus: 'verified', isActive: true });

  res.json({
    types: types.filter(Boolean).sort(),
    vehicles: vehicles.map((v) => ({
      _id: v._id,
      name: v.name,
      vehicleType: v.vehicleType,
      plate: maskPlate(v.vehicleNumber),
      capacityKg: v.vehicleCapacityKg,
      ratePerKm: v.ratePerKm ?? null,
      serviceArea: v.serviceArea ?? '',
      trips: tripsBy.get(String(v._id)) ?? 0,
      rating: scores.get(String(v._id)) ?? null,
      memberSince: v.createdAt,
    })),
  });
});
