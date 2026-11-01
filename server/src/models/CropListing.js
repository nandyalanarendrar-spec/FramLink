import mongoose from 'mongoose';

export const CATEGORIES = ['vegetable', 'fruit', 'grain', 'pulse', 'spice', 'other'];
export const GRADES = ['A', 'B', 'C'];
export const STATUSES = ['draft', 'active', 'partially_sold', 'sold_out', 'paused', 'expired', 'withdrawn'];

const cropListingSchema = new mongoose.Schema(
  {
    farmer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    crop: { type: String, required: true, trim: true },
    category: { type: String, enum: CATEGORIES, required: true },
    unit: { type: String, enum: ['kg'], default: 'kg' },
    quantity: { type: Number, required: true, min: 0 }, // total listed
    availableQty: { type: Number, required: true, min: 0 }, // still unreserved (orders module will decrement atomically)
    minOrderQty: { type: Number, min: 0 },
    expectedPrice: { type: Number, required: true, min: 0 }, // ₹ per kg
    grade: { type: String, enum: GRADES, default: 'B' },
    harvestDate: { type: Date, required: true },
    availableFrom: Date,
    deadline: { type: Date, required: true }, // last day to sell
    district: { type: String, required: true, trim: true },
    village: { type: String, required: true, trim: true },
    description: { type: String, trim: true, maxlength: 500 },
    images: [String], // Cloudinary URLs (upload added later)
    status: { type: String, enum: STATUSES, default: 'draft' },
  },
  { timestamps: true }
);

cropListingSchema.index({ farmer: 1, status: 1 });
cropListingSchema.index({ crop: 1, status: 1, district: 1 });

export default mongoose.model('CropListing', cropListingSchema);
