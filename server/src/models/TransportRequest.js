import mongoose from 'mongoose';

export const TRANSPORT_STATUSES = ['open', 'accepted', 'picked_up', 'delivered', 'cancelled'];
export const ACTIVE_TRANSPORT = ['open', 'accepted', 'picked_up'];

// A request to move one order's produce (made by its farmer or its buyer), claimed by one verified transporter
const transportSchema = new mongoose.Schema(
  {
    order: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true }, // indexed below (unique while active)
    farmer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true }, // the order's farmer
    buyer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true }, // the order's buyer
    requester: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // whoever asked for the transport (farmer or buyer)
    requesterRole: { type: String, enum: ['farmer', 'buyer'] },
    transporter: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true }, // set when accepted
    targetTransporter: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // booked directly from the vehicle list: only this transporter sees it

    crop: { type: String, required: true },
    weightKg: { type: Number, required: true, min: 0 },
    pickupAddress: { type: String, required: true, trim: true, maxlength: 200 },
    dropAddress: { type: String, required: true, trim: true, maxlength: 200 },
    pickupDate: { type: Date, required: true },
    ratePerKm: { type: Number, min: 0 },
    distanceKm: { type: Number, min: 0 },
    // Filled in by the transporter on delivery: the kilometres actually driven and what that comes to
    actualKm: { type: Number, min: 0 },
    finalCharge: { type: Number, min: 0 }, // ratePerKm x actualKm (or the agreed charge for a flat-price job)
    pickedUpAt: Date,
    deliveredAt: Date,
    // Payment is settled offline; the transporter records that it arrived
    paymentStatus: { type: String, enum: ['pending', 'paid'], default: 'pending' },
    paidAt: Date,
    charge: { type: Number, required: true, min: 0 }, // total ₹ for the trip (ratePerKm x distanceKm when both are given)
    notes: { type: String, trim: true, maxlength: 300 },

    status: { type: String, enum: TRANSPORT_STATUSES, default: 'open' },
    isActive: { type: Boolean, default: true }, // open / accepted / picked_up
    timeline: [{ _id: false, status: String, at: { type: Date, default: Date.now } }],
  },
  { timestamps: true }
);

// At most one live transport request per order
transportSchema.index({ order: 1 }, { unique: true, partialFilterExpression: { isActive: true } });
transportSchema.index({ status: 1, createdAt: -1 });

export default mongoose.model('TransportRequest', transportSchema);
