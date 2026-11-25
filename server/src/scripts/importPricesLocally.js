/**
 * Run this script on your LOCAL machine (in India) to fetch mandi prices
 * from data.gov.in and save them directly to MongoDB.
 *
 * Usage:  node src/scripts/importPricesLocally.js
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import dns from 'node:dns';
import { connectDB } from '../config/db.js';
import { importAgmarknet, agmarknetConfigured } from '../services/agmarknet.js';

if (!agmarknetConfigured()) {
  console.error('DATA_GOV_API_KEY is not set in server/.env');
  process.exit(1);
}

console.log('Connecting to MongoDB…');
if (process.env.DNS_SERVERS) dns.setServers(process.env.DNS_SERVERS.split(','));

await connectDB();
console.log('Running mandi price import from local machine (India)…');

try {
  const result = await importAgmarknet();
  console.log(`✅ Done! Fetched: ${result.fetched}, Saved/Updated: ${result.saved}`);
} catch (err) {
  console.error('❌ Import failed:', err.message);
} finally {
  await mongoose.disconnect();
}
