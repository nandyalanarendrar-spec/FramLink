import mongoose from 'mongoose';

export const OPEN = ['requested', 'negotiating'];
export const REQUEST_STATUSES = [...OPEN, 'accepted', 'rejected', 'cancelled'];

const entrySchema = new mongoose.Schema(
  {
    by: { type: String, enum: ['buyer', 'farmer'], required: true },
    action: { type: String, enum: ['offer', 'counter', 'accept', 'reject', 'cancel'], required: true },
    price: Number,
    quantity: Number,
    transportBy: String,
    transportCharge: Number,
    message: { type: String, maxlength: 300 },
    at: { type: Date, default: Date.now },
  },
  { _id: false }
);

// One negotiation between a buyer and a farmer over one listing.
// The full offer / counter-offer trail lives in `history`.
const purchaseRequestSchema = new mongoose.Schema(
  {
    listing: { type: mongoose.Schema.Types.ObjectId, ref: 'CropListing', required: true, index: true },
    demand: { type: mongoose.Schema.Types.ObjectId, ref: 'Demand' }, // set when the deal came from a buyer's wanted request
    farmer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    buyer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    crop: { type: String, required: true }, // snapshot, listing may change later
    askingPrice: { type: Number, required: true }, // farmer's price when the request was made

    // The offer currently on the table
    quantity: { type: Number, required: true, min: 0 },
    price: { type: Number, required: true, min: 0 },
    turn: { type: String, enum: ['buyer', 'farmer'] }, // who must respond next (unset once closed)

    // Who arranges and pays for moving the produce. Farmer delivery adds the transport cost to the buyer's total.
    transportBy: { type: String, enum: ['buyer', 'farmer'], default: 'buyer' },
    ratePerKm: { type: Number, min: 0 },
    distanceKm: { type: Number, min: 0 },
    transportCharge: { type: Number, min: 0, default: 0 },

    status: { type: String, enum: REQUEST_STATUSES, default: 'requested' },
    isOpen: { type: Boolean, default: true }, // true while requested/negotiating
    message: { type: String, maxlength: 300 },
    neededBy: Date,
    history: [entrySchema],

    finalPrice: Number,
    finalQuantity: Number,
    acceptedAt: Date,
  },
  { timestamps: true }
);

// One open request per buyer per listing, enforced by the database (safe against double-clicks)
purchaseRequestSchema.index({ listing: 1, buyer: 1 }, { unique: true, partialFilterExpression: { isOpen: true } });

export default mongoose.model('PurchaseRequest', purchaseRequestSchema);
