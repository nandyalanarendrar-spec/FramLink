import mongoose from 'mongoose';

export const ACTIVE_ORDER = ['confirmed', 'ready_for_pickup', 'in_transit', 'delivered'];
export const ORDER_STATUSES = [...ACTIVE_ORDER, 'completed', 'cancelled'];

const timelineSchema = new mongoose.Schema(
  {
    status: { type: String, enum: ORDER_STATUSES, required: true },
    by: { type: String, enum: ['system', 'farmer', 'buyer', 'transporter'], required: true },
    note: { type: String, maxlength: 300 },
    at: { type: Date, default: Date.now },
  },
  { _id: false }
);

// Created automatically when a purchase request is accepted. Payment is settled offline;
// the farmer records it here.
const orderSchema = new mongoose.Schema(
  {
    request: { type: mongoose.Schema.Types.ObjectId, ref: 'PurchaseRequest', required: true, unique: true },
    listing: { type: mongoose.Schema.Types.ObjectId, ref: 'CropListing', required: true },
    farmer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    buyer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    crop: { type: String, required: true },
    quantity: { type: Number, required: true, min: 0 }, // kg
    price: { type: Number, required: true, min: 0 }, // ₹ per kg
    total: { type: Number, required: true, min: 0 }, // value of the crop only

    // Who arranges transport (unset on older orders = either side). Farmer delivery adds its cost to the buyer's bill.
    transportBy: { type: String, enum: ['buyer', 'farmer'] },
    ratePerKm: Number,
    distanceKm: Number,
    transportCharge: { type: Number, default: 0, min: 0 },
    grandTotal: { type: Number, min: 0 }, // total + transportCharge

    status: { type: String, enum: ORDER_STATUSES, default: 'confirmed' },
    timeline: [timelineSchema],

    paymentStatus: { type: String, enum: ['pending', 'paid'], default: 'pending' },
    paidAt: Date,

    rating: { stars: { type: Number, min: 1, max: 5 }, comment: { type: String, maxlength: 300 }, at: Date }, // buyer rates farmer
    cancelledBy: { type: String, enum: ['farmer', 'buyer'] },
    cancelReason: String,
  },
  { timestamps: true }
);

orderSchema.index({ farmer: 1, status: 1 });
orderSchema.index({ buyer: 1, status: 1 });

export default mongoose.model('Order', orderSchema);
