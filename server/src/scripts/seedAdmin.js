// Creates (or resets) the admin account from ADMIN_* values in .env
// Run: npm run seed:admin
import 'dotenv/config';
import mongoose from 'mongoose';
import User from '../models/User.js';
import { connectDB } from '../config/db.js';

const { ADMIN_NAME = 'FarmLink Admin', ADMIN_PHONE, ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;
if (!ADMIN_PHONE || !ADMIN_EMAIL || !ADMIN_PASSWORD) {
  console.error('Set ADMIN_PHONE, ADMIN_EMAIL and ADMIN_PASSWORD in .env first');
  process.exit(1);
}

await connectDB();
// There is one owner account: update it in place so changing the email/phone/password in .env works
await User.findOneAndUpdate(
  { role: 'admin' },
  {
    name: ADMIN_NAME,
    phone: ADMIN_PHONE,
    email: ADMIN_EMAIL.toLowerCase(),
    passwordHash: await User.hashPassword(ADMIN_PASSWORD),
    role: 'admin',
    emailVerified: true,
    verificationStatus: 'verified',
    isActive: true,
  },
  { upsert: true, setDefaultsOnInsert: true }
);
console.log(`Admin ready: ${ADMIN_EMAIL}`);
await mongoose.disconnect();
