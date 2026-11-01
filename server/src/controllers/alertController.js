import { z } from 'zod';
import PriceAlert from '../models/PriceAlert.js';
import { AppError, asyncHandler } from '../utils/AppError.js';
import { checkAlerts } from '../services/alerts.js';

const MAX_ALERTS = 10;

const createSchema = z.object({
  crop: z.string().trim().min(2).max(60),
  direction: z.enum(['above', 'below']),
  targetPrice: z.coerce.number().positive().max(100000),
});

export const list = asyncHandler(async (req, res) => {
  res.json({ alerts: await PriceAlert.find({ user: req.user._id }).sort({ createdAt: -1 }).lean() });
});

export const create = asyncHandler(async (req, res) => {
  const data = createSchema.parse(req.body);
  if ((await PriceAlert.countDocuments({ user: req.user._id })) >= MAX_ALERTS) throw new AppError(`You can keep up to ${MAX_ALERTS} price alerts`, 400);
  const alert = await PriceAlert.create({ user: req.user._id, crop: data.crop, cropKey: data.crop.toLowerCase(), direction: data.direction, targetPrice: data.targetPrice });
  checkAlerts(); // today's prices may already satisfy it
  res.status(201).json({ alert });
});

export const remove = asyncHandler(async (req, res) => {
  const a = await PriceAlert.findOneAndDelete({ _id: req.params.id, user: req.user._id });
  if (!a) throw new AppError('Alert not found', 404);
  res.json({ message: 'Deleted' });
});
