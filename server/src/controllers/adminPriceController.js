import { z } from 'zod';
import MarketPrice from '../models/MarketPrice.js';
import { AppError, asyncHandler } from '../utils/AppError.js';
import { AP_DISTRICTS, normalizeDistrict } from '../utils/geo.js';
import { agmarknetConfigured } from '../services/agmarknet.js';
import { lastImport, runPriceImport } from '../jobs/priceImport.js';
import { checkAlerts } from '../services/alerts.js';

const priceSchema = z
  .object({
    crop: z.string().trim().min(2).max(60),
    variety: z.string().trim().max(60).optional(),
    market: z.string().trim().min(2).max(80),
    district: z.string().trim().min(2).max(60),
    minPrice: z.coerce.number().positive().max(100000),
    maxPrice: z.coerce.number().positive().max(100000),
    modalPrice: z.coerce.number().positive().max(100000).optional(),
    date: z.coerce.date(),
  })
  .superRefine((d, ctx) => {
    const bad = (path, message) => ctx.addIssue({ code: 'custom', path: [path], message });
    if (!normalizeDistrict(d.district)) bad('district', 'Choose an Andhra Pradesh district from the list');
    if (d.maxPrice < d.minPrice) bad('maxPrice', 'Max price cannot be lower than min price');
    if (d.modalPrice && (d.modalPrice < d.minPrice || d.modalPrice > d.maxPrice)) bad('modalPrice', 'Modal price must be between min and max');
    if (d.date.getTime() > Date.now() + 864e5) bad('date', 'Date cannot be in the future');
  });

export const status = asyncHandler(async (_req, res) => {
  const [total, newest] = await Promise.all([MarketPrice.countDocuments(), MarketPrice.findOne({}, 'date').sort({ date: -1 }).lean()]);
  res.json({ agmarknetConfigured: agmarknetConfigured(), total, newestDate: newest?.date ?? null, lastImport, autoImport: agmarknetConfigured() && process.env.DISABLE_JOBS !== 'true' });
});

export const districts = (_req, res) => res.json({ districts: Object.keys(AP_DISTRICTS).sort() });

export const list = asyncHandler(async (_req, res) => {
  res.json({ prices: await MarketPrice.find().sort({ date: -1, createdAt: -1 }).limit(60).lean() });
});

// Prices are entered in rupees per kg
export const add = asyncHandler(async (req, res) => {
  const d = priceSchema.parse(req.body);
  const modal = d.modalPrice ?? Math.round(((d.minPrice + d.maxPrice) / 2) * 100) / 100;
  const doc = {
    crop: d.crop,
    cropKey: d.crop.toLowerCase(),
    variety: d.variety,
    market: d.market,
    district: normalizeDistrict(d.district),
    minPrice: d.minPrice,
    maxPrice: d.maxPrice,
    modalPrice: modal,
    date: new Date(Date.UTC(d.date.getUTCFullYear(), d.date.getUTCMonth(), d.date.getUTCDate())),
    source: 'admin',
    addedBy: req.user._id,
  };
  // Re-entering the same crop/market/day corrects the earlier entry
  const price = await MarketPrice.findOneAndUpdate({ cropKey: doc.cropKey, market: doc.market, date: doc.date, source: 'admin' }, { $set: doc }, { upsert: true, new: true });
  checkAlerts();
  res.status(201).json({ price });
});

export const remove = asyncHandler(async (req, res) => {
  const p = await MarketPrice.findOneAndDelete({ _id: req.params.id, source: 'admin' }); // imported government rows are kept
  if (!p) throw new AppError('Only prices you entered can be deleted', 404);
  res.json({ message: 'Deleted' });
});

export const importPrices = asyncHandler(async (_req, res) => {
  res.json(await runPriceImport('manual'));
});
