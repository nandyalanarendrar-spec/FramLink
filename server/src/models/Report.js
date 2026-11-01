import mongoose from 'mongoose';

export const REPORT_CATEGORIES = ['wrong_quantity', 'quality_issue', 'payment_issue', 'no_show', 'fake_listing', 'abusive_behaviour', 'other'];

// A complaint about an order or a listing. Admins review it and mark it resolved or dismissed.
const reportSchema = new mongoose.Schema(
  {
    reporter: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    reported: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true }, // the other person involved
    targetType: { type: String, enum: ['order', 'listing'], required: true },
    target: { type: mongoose.Schema.Types.ObjectId, required: true },
    summary: String, // e.g. "Tomato, 600 kg": kept so the report stays readable if the target changes
    category: { type: String, enum: REPORT_CATEGORIES, required: true },
    details: { type: String, trim: true, maxlength: 500 },
    status: { type: String, enum: ['open', 'resolved', 'dismissed'], default: 'open' },
    adminNote: { type: String, maxlength: 300 },
    resolvedAt: Date,
  },
  { timestamps: true }
);

// One open report per person per thing: stops repeat clicks and spam
reportSchema.index({ reporter: 1, targetType: 1, target: 1 }, { unique: true, partialFilterExpression: { status: 'open' } });

export default mongoose.model('Report', reportSchema);
