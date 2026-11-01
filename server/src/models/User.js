import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

export const ROLES = ['farmer', 'buyer', 'transporter', 'admin'];

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    phone: { type: String, required: true, unique: true, trim: true },
    email: { type: String, required: true, trim: true, lowercase: true, unique: true },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ROLES, required: true },
    isActive: { type: Boolean, default: true },

    // Step 1: email OTP (customer proves they own the email)
    emailVerified: { type: Boolean, default: false },
    emailOtp: {
      type: { hash: String, expiresAt: Date, attempts: { type: Number, default: 0 }, lastSentAt: Date },
      select: false,
    },

    // Forgot-password code (hashed, short-lived) and the change-email request waiting for its code
    passwordReset: {
      type: { hash: String, expiresAt: Date, attempts: { type: Number, default: 0 }, lastSentAt: Date },
      select: false,
    },
    pendingEmail: {
      type: { email: String, hash: String, expiresAt: Date, attempts: { type: Number, default: 0 }, lastSentAt: Date },
      select: false,
    },
    // Set when the password changes. Logins issued before that stop working (see the "pv" claim in the token).
    passwordChangedAt: Date,

    // Step 2: admin review (applies to farmer, buyer and transporter)
    verificationStatus: { type: String, enum: ['pending', 'verified', 'rejected'], default: 'pending' },
    rejectionReason: String,
    verifiedAt: Date,

    // Details the admin reviews (submitted from the Profile page)
    detailsSubmittedAt: Date,
    idType: { type: String, enum: ['farmer_id', 'voter_id', 'pan', 'driving_licence'] },
    idNumber: { type: String, trim: true, uppercase: true },
    licenceNumber: { type: String, trim: true, uppercase: true }, // transporter driving licence
    landSurveyNumber: { type: String, trim: true },
    businessAddress: { type: String, trim: true },
    gstNumber: { type: String, trim: true, uppercase: true },

    // Verification documents (ID proof photo/PDF). Stored privately, see utils/files.js
    documents: [{ name: String, file: String, mime: String, uploadedAt: { type: Date, default: Date.now } }],

    // Transporter: switch off to stop receiving new jobs
    isAvailable: { type: Boolean, default: true },

    // Role-specific details collected at registration
    buyerType: { type: String, enum: ['retailer', 'wholesaler', 'consumer'] },
    businessName: { type: String, trim: true },
    vehicleType: { type: String, trim: true },
    vehicleNumber: { type: String, trim: true, uppercase: true },
    vehicleCapacityKg: Number,
    ratePerKm: { type: Number, min: 0 }, // transporter's usual price, shown to farmers and buyers
    serviceArea: { type: String, trim: true, maxlength: 80 }, // e.g. districts served
  },
  { timestamps: true }
);

userSchema.index({ role: 1, verificationStatus: 1 });

userSchema.methods.verifyPassword = function (plain) {
  return bcrypt.compare(plain, this.passwordHash);
};

userSchema.statics.hashPassword = (plain) => bcrypt.hash(plain, 12);

export default mongoose.model('User', userSchema);
