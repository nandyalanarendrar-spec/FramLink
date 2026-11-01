import mongoose from 'mongoose';

export const OFFER_STATUSES = ['pending', 'accepted', 'declined', 'withdrawn'];

// A transporter volunteering to move a confirmed order. The person responsible for transport
// (the order's transportBy side) picks one offer, which turns into an assigned TransportRequest.
const offerSchema = new mongoose.Schema(
  {
    order: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true, index: true },
    transporter: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    ratePerKm: { type: Number, required: true, min: 1 },
    distanceKm: { type: Number, required: true, min: 1 },
    charge: { type: Number, required: true, min: 0 }, // ratePerKm x distanceKm
    message: { type: String, trim: true, maxlength: 300 },
    status: { type: String, enum: OFFER_STATUSES, default: 'pending' },
    isPending: { type: Boolean, default: true },
  },
  { timestamps: true }
);

// One pending offer per transporter per order
offerSchema.index({ order: 1, transporter: 1 }, { unique: true, partialFilterExpression: { isPending: true } });

export default mongoose.model('TransportOffer', offerSchema);
