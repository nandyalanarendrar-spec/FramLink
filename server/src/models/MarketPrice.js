import mongoose from 'mongoose';

// One observed wholesale price for one crop in one market on one day (₹ per kg).
// Rows come from AGMARKNET (government mandi data) or are entered by an admin.
const marketPriceSchema = new mongoose.Schema(
  {
    crop: { type: String, required: true, trim: true },
    cropKey: { type: String, required: true }, // lowercase crop, for matching
    variety: { type: String, trim: true },
    market: { type: String, required: true, trim: true },
    district: { type: String, required: true, trim: true },
    state: { type: String, default: 'Andhra Pradesh' },
    minPrice: { type: Number, required: true, min: 0 },
    maxPrice: { type: Number, required: true, min: 0 },
    modalPrice: { type: Number, required: true, min: 0 }, // most common price that day
    unit: { type: String, default: 'kg' },
    date: { type: Date, required: true }, // date the price was observed
    source: { type: String, enum: ['agmarknet', 'admin'], required: true },
    addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

marketPriceSchema.index({ cropKey: 1, market: 1, date: 1, source: 1 }, { unique: true });
marketPriceSchema.index({ cropKey: 1, date: -1 });

export default mongoose.model('MarketPrice', marketPriceSchema);
