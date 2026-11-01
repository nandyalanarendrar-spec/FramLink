import dns from 'node:dns';
import mongoose from 'mongoose';

export async function connectDB() {
  if (!process.env.MONGO_URI) throw new Error('MONGO_URI is not set in .env');
  // Some local networks/routers refuse SRV lookups needed by mongodb+srv://
  if (process.env.DNS_SERVERS) dns.setServers(process.env.DNS_SERVERS.split(','));
  await mongoose.connect(process.env.MONGO_URI);
  console.log(`MongoDB connected: ${mongoose.connection.host}`);
}
