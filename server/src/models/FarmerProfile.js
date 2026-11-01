import mongoose from 'mongoose';

// Farm details. Verification status lives on User (shared by all roles).
const farmerProfileSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    state: { type: String, default: 'Andhra Pradesh' },
    district: { type: String, required: true, trim: true },
    village: { type: String, required: true, trim: true },
    farmAddress: { type: String, trim: true },
    farmSizeAcres: Number,
    location: {
      type: { type: String, enum: ['Point'] },
      coordinates: { type: [Number] }, // [lng, lat]
    },
  },
  { timestamps: true }
);

farmerProfileSchema.index({ location: '2dsphere' }, { sparse: true });

export default mongoose.model('FarmerProfile', farmerProfileSchema);
