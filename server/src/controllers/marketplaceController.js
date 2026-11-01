import { z } from 'zod';
import CropListing, { CATEGORIES, GRADES } from '../models/CropListing.js';
import User from '../models/User.js';
import FarmerProfile from '../models/FarmerProfile.js';
import PurchaseRequest from '../models/PurchaseRequest.js';
import Order from '../models/Order.js';
import { AppError, asyncHandler } from '../utils/AppError.js';
import { liveFilter } from '../utils/listing.js';
import { ratingOf } from '../services/ratings.js';

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const SORTS = {
  newest: { createdAt: -1, _id: -1 },
  price_asc: { expectedPrice: 1, _id: 1 },
  price_desc: { expectedPrice: -1, _id: 1 },
  qty_desc: { availableQty: -1, _id: 1 },
  deadline: { deadline: 1, _id: 1 },
};

const querySchema = z.object({
  q: z.string().trim().max(60).optional(),
  category: z.enum(CATEGORIES).optional(),
  district: z.string().trim().max(60).optional(),
  grade: z.enum(GRADES).optional(),
  minPrice: z.coerce.number().min(0).optional(),
  maxPrice: z.coerce.number().min(0).optional(),
  minQty: z.coerce.number().min(0).optional(),
  sort: z.enum(Object.keys(SORTS)).default('newest'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(12),
});

export const search = asyncHandler(async (req, res) => {
  const f = querySchema.parse(req.query);

  const match = liveFilter();
  if (f.q) match.crop = { $regex: escapeRegex(f.q), $options: 'i' };
  if (f.category) match.category = f.category;
  if (f.district) match.district = { $regex: `^${escapeRegex(f.district)}$`, $options: 'i' };
  if (f.grade) match.grade = f.grade;
  if (f.minPrice != null || f.maxPrice != null) {
    match.expectedPrice = { ...(f.minPrice != null && { $gte: f.minPrice }), ...(f.maxPrice != null && { $lte: f.maxPrice }) };
  }
  if (f.minQty) match.availableQty = { $gte: f.minQty };

  const [out] = await CropListing.aggregate([
    { $match: match },
    {
      $lookup: {
        from: 'users',
        localField: 'farmer',
        foreignField: '_id',
        as: 'farmerDoc',
        pipeline: [{ $project: { name: 1, verificationStatus: 1, isActive: 1, createdAt: 1 } }],
      },
    },
    { $unwind: '$farmerDoc' },
    { $match: { 'farmerDoc.verificationStatus': 'verified', 'farmerDoc.isActive': true } },
    { $sort: SORTS[f.sort] },
    {
      $facet: {
        items: [
          { $skip: (f.page - 1) * f.limit },
          { $limit: f.limit },
          {
            $addFields: {
              farmer: { id: '$farmerDoc._id', name: '$farmerDoc.name', memberSince: '$farmerDoc.createdAt', verified: true },
            },
          },
          { $project: { farmerDoc: 0 } },
        ],
        total: [{ $count: 'n' }],
      },
    },
  ]);

  const total = out.total[0]?.n ?? 0;
  res.json({ listings: out.items, total, page: f.page, pages: Math.max(1, Math.ceil(total / f.limit)) });
});

// Values for the filter dropdowns, taken from what is actually for sale
export const facets = asyncHandler(async (_req, res) => {
  const rows = await CropListing.aggregate([
    { $match: liveFilter() },
    {
      $lookup: {
        from: 'users',
        localField: 'farmer',
        foreignField: '_id',
        as: 'f',
        pipeline: [{ $match: { verificationStatus: 'verified', isActive: true } }, { $project: { _id: 1 } }],
      },
    },
    { $match: { 'f.0': { $exists: true } } }, // only listings from verified farmers
    { $group: { _id: null, crops: { $addToSet: '$crop' }, districts: { $addToSet: '$district' } } },
  ]);
  const sort = (a = []) => [...a].sort((x, y) => x.localeCompare(y));
  res.json({ crops: sort(rows[0]?.crops), districts: sort(rows[0]?.districts) });
});

export const detail = asyncHandler(async (req, res) => {
  const listing = await CropListing.findOne({ _id: req.params.id, ...liveFilter() }).lean();
  if (!listing) throw new AppError('This listing is no longer available', 404);

  const farmer = await User.findOne({ _id: listing.farmer, verificationStatus: 'verified', isActive: true }, 'name createdAt').lean();
  if (!farmer) throw new AppError('This listing is no longer available', 404);

  const [profile, activeListings, openRequest, farmerRating] = await Promise.all([
    FarmerProfile.findOne({ user: farmer._id }, 'village district state').lean(),
    CropListing.countDocuments({ farmer: farmer._id, ...liveFilter() }),
    PurchaseRequest.findOne({ listing: listing._id, buyer: req.user._id, isOpen: true }, '_id').lean(),
    ratingOf(farmer._id),
  ]);

  // Contact details stay private; buyers reach farmers through purchase requests
  res.json({
    listing,
    openRequestId: openRequest?._id ?? null,
    farmer: {
      name: farmer.name,
      verified: true,
      memberSince: farmer.createdAt,
      village: profile?.village,
      district: profile?.district,
      state: profile?.state,
      activeListings,
      rating: farmerRating,
    },
  });
});
