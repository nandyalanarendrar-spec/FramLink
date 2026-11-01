import mongoose from 'mongoose';

export const DEMAND_STATUSES = ['open', 'filled', 'closed'];

// A buyer's "wanted" post: the crop, how much, the most they will pay and when they need it.
// Every verified farmer can see it and offer from their own listing.
const demandSchema = new mongoose.Schema(
  {
    buyer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    crop: { type: String, required: true, trim: true },
    cropKey: { type: String, required: true }, // lowercase, for matching listings
    quantity: { type: Number, required: true, min: 0 }, // kg wanted
    filledQty: { type: Number, default: 0, min: 0 }, // kg already agreed with farmers
    maxPrice: { type: Number, required: true, min: 0 }, // most the buyer will pay, ₹ per kg
    neededBy: { type: Date, required: true },
    deliverTo: { type: String, required: true, trim: true, maxlength: 120 }, // district / place
    notes: { type: String, trim: true, maxlength: 300 },
    status: { type: String, enum: DEMAND_STATUSES, default: 'open' },
    isOpen: { type: Boolean, default: true },
  },
  { timestamps: true }
);

demandSchema.index({ isOpen: 1, neededBy: 1, cropKey: 1 });

export default mongoose.model('Demand', demandSchema);
