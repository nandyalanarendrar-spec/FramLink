// Test harness: boots the real Express app in-process against a SEPARATE database (farmlink_test),
// so running the tests never touches real data. The test database is dropped at the end.
import 'dotenv/config';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import http from 'node:http';
import dns from 'node:dns';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

process.env.NODE_ENV = 'test';
process.env.DISABLE_JOBS = 'true';
process.env.AUTH_RATE_LIMIT = '100000';
process.env.API_RATE_LIMIT = '100000';
process.env.UPLOAD_DIR = path.join(os.tmpdir(), 'farmlink-test-uploads');
if (process.env.DNS_SERVERS) dns.setServers(process.env.DNS_SERVERS.split(','));

const TEST_DB = 'farmlink_test';
let server;
let base;

export async function start() {
  await mongoose.connect(process.env.MONGO_URI, { dbName: TEST_DB });
  if (mongoose.connection.name !== TEST_DB) throw new Error('Refusing to run: not connected to the test database');
  await mongoose.connection.dropDatabase(); // start clean even if an earlier run was killed before it could clean up
  const { default: app } = await import('../src/app.js'); // imported after the env above is set
  await Promise.all(Object.values(mongoose.models).map((m) => m.init())); // build indexes (unique/partial ones matter)
  server = http.createServer(app);
  await new Promise((r) => server.listen(0, r));
  base = `http://127.0.0.1:${server.address().port}`;
}

export async function stop() {
  if (mongoose.connection.name === TEST_DB) await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
  await new Promise((r) => server.close(r));
  fs.rmSync(process.env.UPLOAD_DIR, { recursive: true, force: true });
}

export const db = () => mongoose.connection.db;
export const oid = (s) => new mongoose.Types.ObjectId(s);

// One cookie jar per simulated person
export class Client {
  cookie = '';
  async request(method, url, body, extra = {}) {
    const isForm = body instanceof FormData;
    const res = await fetch(base + url, {
      method,
      headers: { ...(isForm ? {} : { 'content-type': 'application/json' }), cookie: this.cookie, ...extra },
      body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
    });
    const set = res.headers.get('set-cookie');
    if (set) this.cookie = set.split(';')[0];
    const text = await res.text();
    let data = {};
    try { data = JSON.parse(text); } catch { data = { raw: text }; }
    return { status: res.status, data, headers: res.headers, raw: text };
  }
  get = (u) => this.request('GET', u);
  post = (u, b) => this.request('POST', u, b ?? {});
  put = (u, b) => this.request('PUT', u, b);
  patch = (u, b) => this.request('PATCH', u, b ?? {});
  del = (u) => this.request('DELETE', u);
  upload(url, field, files) {
    const fd = new FormData();
    for (const [name, buf, type] of files) fd.append(field, new Blob([buf], { type }), name);
    return this.request('POST', url, fd);
  }
}

let seq = 0;
/** Register + confirm email (the API hands back the OTP when no SMTP is configured). Returns { client, id }. */
export async function person(role, extra = {}) {
  const n = ++seq;
  const client = new Client();
  const reg = await client.post('/api/auth/register', {
    name: `${role} ${n}`,
    phone: `98765${String(40000 + n)}`,
    email: `${role}${n}@test.local`,
    password: 'Passw0rd1',
    role,
    ...(role === 'farmer' && { district: 'Anantapur', village: 'Dharmavaram' }),
    ...(role === 'buyer' && { buyerType: 'retailer' }),
    ...(role === 'transporter' && { vehicleType: 'Mini truck', vehicleNumber: `AP02AB${1000 + n}`, vehicleCapacityKg: 1000 }),
    ...extra,
  });
  if (reg.status !== 201) throw new Error(`register failed: ${JSON.stringify(reg.data)}`);
  await client.post('/api/auth/verify-email', { otp: reg.data.devOtp });
  return { client, id: oid(reg.data.user.id), email: `${role}${n}@test.local` };
}

/** Skip the document + admin step: mark an account as verified directly */
export const markVerified = (...people) =>
  db().collection('users').updateMany({ _id: { $in: people.map((p) => p.id) } }, { $set: { verificationStatus: 'verified', detailsSubmittedAt: new Date() } });

export async function admin() {
  const client = new Client();
  await db().collection('users').insertOne({
    name: 'Test Admin', phone: '9876599999', email: 'admin@test.local', passwordHash: await bcrypt.hash('Passw0rd1', 4),
    role: 'admin', isActive: true, emailVerified: true, verificationStatus: 'verified', createdAt: new Date(), updatedAt: new Date(),
  });
  await client.post('/api/auth/login', { identifier: 'admin@test.local', password: 'Passw0rd1' });
  return client;
}

export const iso = (days) => new Date(Date.now() + days * 864e5).toISOString().slice(0, 10);
export const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
export const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\n%%EOF');
export const FAKE_IMAGE = Buffer.from('MZ this is an executable pretending to be a photo');
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
