import mongoose from 'mongoose';

export const PARTY_ROLES = ['farmer', 'buyer', 'transporter'];

// One person rating another after a trade. Farmer, buyer and the transporter on an order can each rate the others once.
const ratingSchema = new mongoose.Schema(
  {
    order: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true },
    from: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    to: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    fromRole: { type: String, enum: PARTY_ROLES, required: true },
    toRole: { type: String, enum: PARTY_ROLES, required: true },
    stars: { type: Number, min: 1, max: 5, required: true },
    comment: { type: String, trim: true, maxlength: 300 },
  },
  { timestamps: true }
);

ratingSchema.index({ order: 1, from: 1, to: 1 }, { unique: true }); // one rating per pair per order

export default mongoose.model('Rating', ratingSchema);
