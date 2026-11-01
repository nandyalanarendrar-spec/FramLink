import mongoose from 'mongoose';

// "Tell me when tomato reaches ₹28/kg". Checked whenever new market prices arrive.
const priceAlertSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    crop: { type: String, required: true, trim: true },
    cropKey: { type: String, required: true, index: true },
    direction: { type: String, enum: ['above', 'below'], required: true },
    targetPrice: { type: Number, required: true, min: 0 }, // ₹ per kg
    lastTriggeredAt: Date,
  },
  { timestamps: true }
);

export default mongoose.model('PriceAlert', priceAlertSchema);
