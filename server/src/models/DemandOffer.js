import mongoose from 'mongoose';

export const OFFER_STATUSES = ['pending', 'accepted', 'declined', 'withdrawn'];

// A farmer's answer to a wanted post, made from one of their live listings.
// Accepting it reserves the stock and creates a normal order.
const demandOfferSchema = new mongoose.Schema(
  {
    demand: { type: mongoose.Schema.Types.ObjectId, ref: 'Demand', required: true, index: true },
    farmer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    listing: { type: mongoose.Schema.Types.ObjectId, ref: 'CropListing', required: true },
    quantity: { type: Number, required: true, min: 0 },
    price: { type: Number, required: true, min: 0 }, // ₹ per kg
    transportBy: { type: String, enum: ['buyer', 'farmer'], default: 'buyer' },
    ratePerKm: Number,
    distanceKm: Number,
    transportCharge: { type: Number, default: 0, min: 0 },
    message: { type: String, trim: true, maxlength: 300 },
    status: { type: String, enum: OFFER_STATUSES, default: 'pending' },
    isPending: { type: Boolean, default: true },
    order: { type: mongoose.Schema.Types.ObjectId, ref: 'Order' }, // set when accepted
  },
  { timestamps: true }
);

// One pending offer per farmer per wanted post
demandOfferSchema.index({ demand: 1, farmer: 1 }, { unique: true, partialFilterExpression: { isPending: true } });

export default mongoose.model('DemandOffer', demandOfferSchema);
