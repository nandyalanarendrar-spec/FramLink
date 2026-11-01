import mongoose from 'mongoose';

// Remembers which reminder was already sent to whom, so the daily job never repeats itself.
const reminderLogSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    key: { type: String, required: true }, // e.g. "deadline:<listingId>:2"
    createdAt: { type: Date, default: Date.now, expires: 45 * 24 * 3600 }, // forgotten after 45 days
  },
  { versionKey: false }
);

reminderLogSchema.index({ user: 1, key: 1 }, { unique: true });

export default mongoose.model('ReminderLog', reminderLogSchema);
