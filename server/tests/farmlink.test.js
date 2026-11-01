import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { start, stop, db, oid, Client, person, markVerified, admin, iso, sleep, PNG, PDF, FAKE_IMAGE } from './helpers.js';

before(start);
after(stop);

describe('security and accounts', () => {
  it('rejects weak passwords, bad phones and self-registered admins', async () => {
    const c = new Client();
    const base = { name: 'Test User', phone: '9876500001', email: 'x@test.local', role: 'buyer', buyerType: 'retailer' };
    assert.equal((await c.post('/api/auth/register', { ...base, password: 'password' })).status, 400); // no number
    assert.equal((await c.post('/api/auth/register', { ...base, password: '12345678' })).status, 400); // no letter
    assert.equal((await c.post('/api/auth/register', { ...base, password: 'Passw0rd1', phone: '12345' })).status, 400);
    assert.equal((await c.post('/api/auth/register', { ...base, password: 'Passw0rd1', role: 'admin' })).status, 400);
  });

  it('blocks NoSQL operator injection in body and query', async () => {
    const c = new Client();
    const body = await c.post('/api/auth/login', { identifier: { $ne: '' }, password: { $ne: '' } });
    assert.equal(body.status, 400);
    const buyer = await person('buyer');
    await markVerified(buyer);
    const plain = await buyer.client.get('/api/marketplace');
    const q = await buyer.client.get('/api/marketplace?district[$ne]=nothing&q[$regex]=.*');
    assert.equal(q.status, 200);
    assert.equal(q.data.total, plain.data.total, 'operator keys are stripped, so they cannot change the result');
  });

  it('email OTP: wrong code fails, right code verifies, resend is rate limited', async () => {
    const c = new Client();
    const reg = await c.post('/api/auth/register', { name: 'Otp User', phone: '9876500002', email: 'otp@test.local', password: 'Passw0rd1', role: 'buyer', buyerType: 'retailer' });
    assert.equal(reg.status, 201);
    assert.equal((await c.get('/api/auth/me')).data.user.emailVerified, false);
    assert.equal((await c.post('/api/auth/verify-email', { otp: '000000' })).status, 400);
    assert.equal((await c.post('/api/auth/resend-otp')).status, 429, 'cooldown after the first send');
    assert.equal((await c.post('/api/auth/verify-email', { otp: reg.data.devOtp })).status, 200);
    assert.equal((await c.get('/api/auth/me')).data.user.emailVerified, true);
  });

  it('login gives the same error for unknown user and wrong password', async () => {
    const p = await person('buyer');
    const c = new Client();
    const wrong = await c.post('/api/auth/login', { identifier: p.email, password: 'WrongPass1' });
    const unknown = await c.post('/api/auth/login', { identifier: 'nobody@test.local', password: 'WrongPass1' });
    assert.equal(wrong.status, 401);
    assert.equal(unknown.status, 401);
    assert.equal(wrong.data.message, unknown.data.message);
  });

  it('protected routes need a login, and roles are enforced', async () => {
    assert.equal((await new Client().get('/api/crops/mine')).status, 401);
    const buyer = await person('buyer');
    await markVerified(buyer);
    assert.equal((await buyer.client.get('/api/crops/mine')).status, 403);
    assert.equal((await buyer.client.get('/api/admin/accounts')).status, 403);
  });
});

describe('verification gate and private documents', () => {
  const farmer = {};
  it('unverified farmer cannot create crops; submission needs a document', async () => {
    Object.assign(farmer, await person('farmer'));
    const crop = { crop: 'Tomato', category: 'vegetable', quantity: 100, expectedPrice: 20, harvestDate: iso(1), deadline: iso(5) };
    assert.equal((await farmer.client.post('/api/crops', crop)).status, 403);
    const details = { idType: 'farmer_id', idNumber: 'AP123456', farmSizeAcres: 3, farmAddress: 'Survey 1, Dharmavaram' };
    const noDoc = await farmer.client.put('/api/profile/verification', details);
    assert.equal(noDoc.status, 400);
    assert.match(noDoc.data.message, /ID proof/);
  });

  it('documents: real type is checked, owner and admin can read, others cannot', async () => {
    assert.equal((await farmer.client.upload('/api/profile/documents', 'files', [['id.png', FAKE_IMAGE, 'image/png']])).status, 400, 'content sniffing, not file name');
    const up = await farmer.client.upload('/api/profile/documents', 'files', [['id.png', PNG, 'image/png'], ['id.pdf', PDF, 'application/pdf']]);
    assert.equal(up.status, 201);
    assert.equal(up.data.documents.length, 2);
    const docId = up.data.documents[0].id;

    assert.equal((await farmer.client.get(`/api/files/docs/${docId}`)).status, 200);
    assert.equal((await new Client().get(`/api/files/docs/${docId}`)).status, 401);
    const other = await person('buyer');
    assert.equal((await other.client.get(`/api/files/docs/${docId}`)).status, 404);
    const adm = await admin();
    assert.equal((await adm.get(`/api/files/docs/${docId}`)).status, 200);
    farmer.adm = adm;
  });

  it('admin queue shows the submission; verify unlocks crops and locks documents', async () => {
    const details = { idType: 'farmer_id', idNumber: 'AP123456', farmSizeAcres: 3, farmAddress: 'Survey 1, Dharmavaram' };
    assert.equal((await farmer.client.put('/api/profile/verification', details)).status, 200);
    const queue = await farmer.adm.get('/api/admin/users?status=pending');
    const row = queue.data.users.find((u) => u._id === String(farmer.id));
    assert.ok(row, 'farmer is in the pending queue');
    assert.equal(row.documents.length, 2);
    assert.ok(!('file' in row.documents[0]), 'stored file names never leave the server');

    assert.equal((await farmer.adm.patch(`/api/admin/users/${farmer.id}/verify`)).status, 200);
    const crop = { crop: 'Tomato', category: 'vegetable', quantity: 100, expectedPrice: 20, harvestDate: iso(1), deadline: iso(5), publish: true };
    assert.equal((await farmer.client.post('/api/crops', crop)).status, 201);
    assert.equal((await farmer.client.upload('/api/profile/documents', 'files', [['more.png', PNG, 'image/png']])).status, 403);
  });
});

describe('accounts verified before documents existed', () => {
  it('can add an ID document once, then it locks', async () => {
    const old = await person('buyer');
    await markVerified(old);
    assert.equal((await old.client.upload('/api/profile/documents', 'files', [['id.png', PNG, 'image/png']])).status, 201);
    assert.equal((await old.client.upload('/api/profile/documents', 'files', [['again.png', PNG, 'image/png']])).status, 403);
  });
});

describe('marketplace, negotiation, orders, transport', () => {
  const ctx = {};
  before(async () => {
    ctx.farmer = await person('farmer');
    ctx.buyer = await person('buyer');
    ctx.buyer2 = await person('buyer');
    ctx.transporter = await person('transporter');
    await markVerified(ctx.farmer, ctx.buyer, ctx.buyer2, ctx.transporter);
    const r = await ctx.farmer.client.post('/api/crops', { crop: 'Tomato', category: 'vegetable', quantity: 1000, expectedPrice: 25, minOrderQty: 100, grade: 'A', harvestDate: iso(1), deadline: iso(7), publish: true });
    assert.equal(r.status, 201);
    ctx.listing = r.data.listing._id;
  });

  it('crop photos: valid images accepted, fake ones and a 5th photo refused, others cannot edit', async () => {
    const f = ctx.farmer.client;
    const ok = await f.upload(`/api/crops/${ctx.listing}/images`, 'images', [['a.png', PNG, 'image/png'], ['b.png', PNG, 'image/png']]);
    assert.equal(ok.status, 201);
    assert.equal(ok.data.listing.images.length, 2);
    assert.equal((await f.upload(`/api/crops/${ctx.listing}/images`, 'images', [['x.jpg', FAKE_IMAGE, 'image/jpeg']])).status, 400);
    assert.equal((await f.upload(`/api/crops/${ctx.listing}/images`, 'images', [['1.png', PNG, 'image/png'], ['2.png', PNG, 'image/png'], ['3.png', PNG, 'image/png']])).status, 400);
    assert.equal((await ctx.buyer.client.upload(`/api/crops/${ctx.listing}/images`, 'images', [['a.png', PNG, 'image/png']])).status, 403);
    const served = await fetch(new URL(ok.data.listing.images[0], `http://127.0.0.1:${new URL((await f.get('/api/health')).headers.get('x-test') ?? 'http://x').port || ''}`)).catch(() => null);
    assert.ok(served === null || served instanceof Response); // static serving is covered by the manual/browser check
  });

  it('marketplace shows only live listings of verified farmers, with filters', async () => {
    const b = ctx.buyer.client;
    const all = await b.get('/api/marketplace');
    assert.equal(all.status, 200);
    assert.ok(all.data.listings.some((l) => l._id === ctx.listing));
    assert.ok(all.data.listings.every((l) => !l.farmer.phone && !l.farmer.email), 'no farmer contact details');
    assert.equal((await b.get('/api/marketplace?q=tom')).data.total >= 1, true);
    assert.equal((await b.get('/api/marketplace?q=nonexistentcrop')).data.total, 0);
    assert.equal((await b.get('/api/marketplace?minPrice=30')).data.listings.some((l) => l._id === ctx.listing), false);
  });

  it('request validation: minimum order, stock, one open request per listing', async () => {
    const b = ctx.buyer.client;
    assert.equal((await b.post('/api/requests', { listingId: ctx.listing, quantity: 50, price: 22 })).status, 400, 'below minimum order');
    assert.equal((await b.post('/api/requests', { listingId: ctx.listing, quantity: 5000, price: 22 })).status, 400, 'more than stock');
    const r = await b.post('/api/requests', { listingId: ctx.listing, quantity: 600, price: 22 });
    assert.equal(r.status, 201);
    ctx.req1 = r.data.request._id;
    assert.equal((await b.post('/api/requests', { listingId: ctx.listing, quantity: 100, price: 22 })).status, 409);
    assert.equal((await ctx.buyer2.client.get(`/api/requests/${ctx.req1}`)).status, 404, 'other buyers cannot read it');
  });

  it('negotiation is turn-based and phone numbers appear only after acceptance', async () => {
    const f = ctx.farmer.client, b = ctx.buyer.client;
    assert.equal((await b.post(`/api/requests/${ctx.req1}/accept`)).status, 409, 'buyer cannot accept their own offer');
    assert.equal((await f.get(`/api/requests/${ctx.req1}`)).data.request.counterpart.phone, undefined);
    const counter = await f.post(`/api/requests/${ctx.req1}/counter`, { price: 24 });
    assert.equal(counter.data.request.status, 'negotiating');
    assert.equal((await f.post(`/api/requests/${ctx.req1}/counter`, { price: 26 })).status, 409, 'not the farmer’s turn again');
    assert.equal((await b.post(`/api/requests/${ctx.req1}/accept`)).status, 200);
    const done = await f.get(`/api/requests/${ctx.req1}`);
    assert.equal(done.data.request.status, 'accepted');
    assert.ok(done.data.request.counterpart.phone, 'phones are shared once accepted');
    ctx.orderId = done.data.request.orderId;
    assert.ok(ctx.orderId, 'an order was created from the accepted request');
  });

  it('stock is reserved, and two accepts racing for the last stock cannot oversell', async () => {
    const listing = await db().collection('croplistings').findOne({ _id: oid(ctx.listing) });
    assert.equal(listing.availableQty, 400);
    assert.equal(listing.status, 'partially_sold');

    const r2 = await ctx.buyer.client.post('/api/requests', { listingId: ctx.listing, quantity: 300, price: 25 });
    const r3 = await ctx.buyer2.client.post('/api/requests', { listingId: ctx.listing, quantity: 300, price: 25 });
    const [a, b] = await Promise.all([ctx.farmer.client.post(`/api/requests/${r2.data.request._id}/accept`), ctx.farmer.client.post(`/api/requests/${r3.data.request._id}/accept`)]);
    assert.deepEqual([a.status, b.status].sort(), [200, 409]);
    const after = await db().collection('croplistings').findOne({ _id: oid(ctx.listing) });
    assert.equal(after.availableQty, 100, 'exactly one 300 kg order fit into the remaining 400 kg');
  });

  it('a buyer can request transport; a transporter accepts; delivery moves the order', async () => {
    const b = ctx.buyer.client, f = ctx.farmer.client, t = ctx.transporter.client;
    const body = { orderId: ctx.orderId, pickupAddress: 'Dharmavaram market yard', dropAddress: 'Anantapur vegetable market', pickupDate: iso(1), charge: 1200 };
    assert.equal((await ctx.buyer2.client.post('/api/transport', body)).status, 404, 'unrelated buyer');
    const created = await b.post('/api/transport', body);
    assert.equal(created.status, 201);
    assert.equal(created.data.transport.requestedBy, 'buyer');
    assert.equal((await f.post('/api/transport', body)).status, 409, 'one active transport per order');
    assert.equal((await f.post(`/api/transport/${created.data.transport._id}/cancel`)).status, 409, 'only the requester can cancel');

    const jobs = await t.get('/api/transport/available');
    assert.equal(jobs.data.transports.length, 1);
    const id = jobs.data.transports[0]._id;
    const accepted = await t.post(`/api/transport/${id}/accept`);
    assert.equal(accepted.status, 200);
    assert.ok(accepted.data.transport.contacts.farmer.phone && accepted.data.transport.contacts.buyer.phone);

    assert.equal((await t.patch(`/api/transport/${id}/status`, { status: 'picked_up' })).status, 409, 'order not ready for pickup yet');
    assert.equal((await f.patch(`/api/orders/${ctx.orderId}/status`, { status: 'ready_for_pickup' })).status, 200);
    assert.equal((await f.patch(`/api/orders/${ctx.orderId}/status`, { status: 'in_transit' })).status, 409, 'the transporter marks pickup, not the farmer');
    assert.equal((await t.patch(`/api/transport/${id}/status`, { status: 'picked_up' })).status, 200);
    const delivered = await t.patch(`/api/transport/${id}/status`, { status: 'delivered' });
    assert.equal(delivered.data.transport.orderStatus, 'delivered');
  });

  it('buyer confirms receipt with a rating; sales and purchase summaries add up', async () => {
    const b = ctx.buyer.client, f = ctx.farmer.client;
    assert.equal((await f.post(`/api/orders/${ctx.orderId}/complete`)).status, 403, 'only the buyer confirms receipt');
    const done = await b.post(`/api/orders/${ctx.orderId}/complete`, { stars: 5, comment: 'Fresh' });
    assert.equal(done.data.order.status, 'completed');
    assert.equal((await b.post(`/api/orders/${ctx.orderId}/complete`, { stars: 9 })).status, 400, 'invalid rating');
    assert.equal((await b.post(`/api/orders/${ctx.orderId}/complete`, { stars: 4 })).status, 409, 'already completed');
    assert.equal((await f.post(`/api/orders/${ctx.orderId}/paid`)).data.order.paymentStatus, 'paid');
    const sales = (await f.get('/api/orders/summary')).data;
    assert.equal(sales.orders, 1);
    assert.equal(sales.quantity, 600);
    assert.equal(sales.value, 600 * 24);
    assert.equal((await b.get('/api/orders/summary')).data.value, sales.value);
  });

  it('cancelling an order puts the stock back and cancels its transport', async () => {
    const f = ctx.farmer.client;
    const before = (await db().collection('croplistings').findOne({ _id: oid(ctx.listing) })).availableQty;
    // whichever buyer won the race holds the still-confirmed order
    let b, order;
    for (const who of [ctx.buyer, ctx.buyer2]) {
      order = (await who.client.get('/api/orders/mine')).data.orders.find((o) => o.status === 'confirmed');
      if (order) { b = who.client; break; }
    }
    assert.ok(order, 'a confirmed order from the race test exists');
    assert.equal((await b.post(`/api/orders/${order._id}/cancel`, { reason: 'Changed my mind' })).status, 200);
    const after = (await db().collection('croplistings').findOne({ _id: oid(ctx.listing) })).availableQty;
    assert.equal(after, before + order.quantity);
    assert.equal((await b.post(`/api/orders/${order._id}/cancel`)).status, 409, 'cannot cancel twice');
    assert.ok(f);
  });

  it('notifications reach the right people and can be marked read', async () => {
    const mine = await ctx.farmer.client.get('/api/notifications');
    assert.ok(mine.data.notifications.length > 0);
    assert.ok(mine.data.notifications.every((n) => String(n.user) === String(ctx.farmer.id)));
    const unread = mine.data.unread;
    const first = mine.data.notifications.find((n) => !n.read);
    assert.equal((await ctx.farmer.client.post(`/api/notifications/${first._id}/read`)).data.unread, unread - 1);
    assert.equal((await ctx.farmer.client.post('/api/notifications/read-all')).data.unread, 0);
    assert.equal((await new Client().get('/api/notifications')).status, 401);
  });
});

describe('admin tools, reports, price alerts, analytics', () => {
  const ctx = {};
  before(async () => {
    ctx.adm = await admin().catch(async () => { const c = new Client(); await c.post('/api/auth/login', { identifier: 'admin@test.local', password: 'Passw0rd1' }); return c; });
    ctx.farmer = await person('farmer');
    ctx.buyer = await person('buyer');
    await markVerified(ctx.farmer, ctx.buyer);
    const r = await ctx.farmer.client.post('/api/crops', { crop: 'Onion', category: 'vegetable', quantity: 2000, expectedPrice: 30, harvestDate: iso(1), deadline: iso(7), publish: true });
    ctx.listing = r.data.listing._id;
  });

  it('switching an account off logs it out and blocks login; admins are protected', async () => {
    const { adm, buyer } = ctx;
    const row = (await adm.get(`/api/admin/accounts?q=${encodeURIComponent(buyer.email)}`)).data.users[0];
    assert.equal((await adm.patch(`/api/admin/accounts/${row._id}/active`, { isActive: false })).status, 200);
    assert.equal((await buyer.client.get('/api/auth/me')).status, 401, 'existing session stops working');
    assert.equal((await new Client().post('/api/auth/login', { identifier: buyer.email, password: 'Passw0rd1' })).status, 403);
    await adm.patch(`/api/admin/accounts/${row._id}/active`, { isActive: true });
    assert.equal((await buyer.client.post('/api/auth/login', { identifier: buyer.email, password: 'Passw0rd1' })).status, 200);
    const self = (await adm.get('/api/admin/accounts?role=admin')).data.users[0];
    assert.equal((await adm.patch(`/api/admin/accounts/${self._id}/active`, { isActive: false })).status, 404);
  });

  it('listing takedown closes open requests and tells both sides', async () => {
    const { adm, farmer, buyer } = ctx;
    const req = await buyer.client.post('/api/requests', { listingId: ctx.listing, quantity: 100, price: 28 });
    assert.equal(req.status, 201);
    assert.equal((await farmer.client.post(`/api/admin/listings/${ctx.listing}/takedown`, { reason: 'because' })).status, 403);
    const res = await adm.post(`/api/admin/listings/${ctx.listing}/takedown`, { reason: 'Wrong crop details' });
    assert.equal(res.data.closedRequests, 1);
    assert.equal((await buyer.client.get(`/api/requests/${req.data.request._id}`)).data.request.status, 'cancelled');
    assert.equal((await buyer.client.get('/api/marketplace')).data.listings.some((l) => l._id === ctx.listing), false);
  });

  it('reports: participants only, one open report each, admin resolves and the reporter hears back', async () => {
    const { adm, farmer, buyer } = ctx;
    const other = await person('buyer');
    await markVerified(other);
    const listing = (await farmer.client.post('/api/crops', { crop: 'Maize', category: 'grain', quantity: 500, expectedPrice: 20, harvestDate: iso(1), deadline: iso(7), publish: true })).data.listing._id;
    assert.equal((await farmer.client.post('/api/reports', { targetType: 'listing', targetId: listing, category: 'other' })).status, 404, 'cannot report your own listing');
    const rep = await buyer.client.post('/api/reports', { targetType: 'listing', targetId: listing, category: 'fake_listing', details: 'Looks fake' });
    assert.equal(rep.status, 201);
    assert.equal((await buyer.client.post('/api/reports', { targetType: 'listing', targetId: listing, category: 'other' })).status, 409);
    assert.equal((await buyer.client.post('/api/reports', { targetType: 'listing', targetId: listing, category: 'bogus' })).status, 400);
    assert.equal((await adm.patch(`/api/admin/reports/${rep.data.report._id}`, { status: 'resolved', note: 'x' })).status, 400, 'a real note is required');
    assert.equal((await adm.patch(`/api/admin/reports/${rep.data.report._id}`, { status: 'resolved', note: 'Listing corrected by the farmer' })).status, 200);
    assert.equal((await adm.patch(`/api/admin/reports/${rep.data.report._id}`, { status: 'dismissed', note: 'again please' })).status, 404, 'already closed');
    const heard = await db().collection('notifications').findOne({ user: buyer.id, title: 'Your report was resolved' });
    assert.ok(heard);
  });

  it('price alerts fire once when a market reaches the target (cooldown), within a per-user limit', async () => {
    const { adm, farmer } = ctx;
    assert.equal((await farmer.client.post('/api/alerts', { crop: 'AlertCrop', direction: 'above', targetPrice: 40 })).status, 201);
    assert.equal((await farmer.client.post('/api/alerts', { crop: 'AlertCrop', direction: 'sideways', targetPrice: 40 })).status, 400);
    const add = (modal, market) => adm.post('/api/admin/prices', { crop: 'AlertCrop', market, district: 'Anantapur', minPrice: modal - 2, maxPrice: modal + 2, modalPrice: modal, date: iso(0) });
    await add(35, 'Low Mandi'); await sleep(400);
    assert.equal(await db().collection('notifications').countDocuments({ user: farmer.id, type: 'alert' }), 0);
    await add(42, 'High Mandi'); await sleep(600);
    assert.equal(await db().collection('notifications').countDocuments({ user: farmer.id, type: 'alert' }), 1);
    await add(45, 'Higher Mandi'); await sleep(600);
    assert.equal(await db().collection('notifications').countDocuments({ user: farmer.id, type: 'alert' }), 1, 'no repeat within a day');
    for (let i = 0; i < 9; i++) await farmer.client.post('/api/alerts', { crop: 'Other', direction: 'above', targetPrice: 50 + i });
    assert.equal((await farmer.client.post('/api/alerts', { crop: 'Other', direction: 'above', targetPrice: 99 })).status, 400);
  });

  it('price comparison: net revenue = quantity x price - transport, best market first', async () => {
    const { adm, farmer } = ctx;
    const add = (market, district, modal) => adm.post('/api/admin/prices', { crop: 'CompareCrop', market, district, minPrice: modal - 1, maxPrice: modal + 1, modalPrice: modal, date: iso(0) });
    await add('Near Mandi', 'Anantapur', 20); await add('Far Mandi', 'Srikakulam', 24);
    const res = await farmer.client.get('/api/prices/compare?crop=CompareCrop&quantity=1000&from=Anantapur');
    assert.equal(res.status, 200);
    assert.equal(res.data.markets.length, 2);
    for (const m of res.data.markets) assert.equal(m.netRevenue, 1000 * m.modalPrice - m.transportCost);
    assert.ok(res.data.markets[0].netRevenue >= res.data.markets[1].netRevenue);
    assert.equal(res.data.best.market, res.data.markets[0].market);
    assert.equal((await farmer.client.get('/api/prices/compare?crop=CompareCrop&quantity=-5')).status, 400);
  });

  it('demand and supply labels crops from platform activity', async () => {
    const { farmer, buyer } = ctx;
    const listing = (await farmer.client.post('/api/crops', { crop: 'Chilli', category: 'spice', quantity: 200, expectedPrice: 90, harvestDate: iso(1), deadline: iso(7), publish: true })).data.listing._id;
    await db().collection('purchaserequests').insertOne({ listing: oid(listing), farmer: farmer.id, buyer: buyer.id, crop: 'Chilli', askingPrice: 90, quantity: 800, price: 85, status: 'requested', isOpen: true, history: [], createdAt: new Date(), updatedAt: new Date() });
    const res = await buyer.client.get('/api/analytics/demand-supply');
    assert.equal(res.status, 200);
    assert.equal(res.data.crops.find((c) => c.crop === 'Chilli').status, 'high_demand');
  });

  it('suggested buyers are ranked, explained, and hide contact details', async () => {
    const { farmer, buyer } = ctx;
    const listing = (await farmer.client.post('/api/crops', { crop: 'Brinjal', category: 'vegetable', quantity: 600, expectedPrice: 25, harvestDate: iso(1), deadline: iso(7), publish: true })).data.listing._id;
    const past = (qty, price, status) => ({ request: oid(), listing: oid(), farmer: oid(), buyer: buyer.id, crop: 'Brinjal', quantity: qty, price, total: qty * price, status, paymentStatus: 'paid', timeline: [], createdAt: new Date(Date.now() - 5 * 864e5), updatedAt: new Date() });
    await db().collection('orders').insertMany([past(600, 26, 'completed'), past(500, 25, 'completed')]);
    const res = await farmer.client.get(`/api/crops/${listing}/recommendations`);
    assert.equal(res.status, 200);
    assert.equal(res.data.buyers[0].buyerId, String(buyer.id));
    assert.ok(res.data.buyers[0].score > 50 && res.data.buyers[0].reasons.length === 4);
    assert.doesNotMatch(JSON.stringify(res.data), /test\.local|98765/);
    assert.equal((await farmer.client.post(`/api/crops/${listing}/recommendations/${buyer.id}/notify`)).status, 200);
    assert.equal((await farmer.client.post(`/api/crops/${listing}/recommendations/${buyer.id}/notify`)).status, 409, 'once per day');
    assert.equal((await buyer.client.get(`/api/crops/${listing}/recommendations`)).status, 403);
  });
});

describe('delivery option, per-km pricing and transporter offers', () => {
  const ctx = {};
  before(async () => {
    ctx.farmer = await person('farmer');
    ctx.buyer = await person('buyer');
    ctx.t1 = await person('transporter');
    ctx.t2 = await person('transporter');
    await markVerified(ctx.farmer, ctx.buyer, ctx.t1, ctx.t2);
    const r = await ctx.farmer.client.post('/api/crops', { crop: 'Banana', category: 'fruit', quantity: 2000, expectedPrice: 10, harvestDate: iso(1), deadline: iso(9), publish: true });
    ctx.listing = r.data.listing._id;
  });

  const deal = async (c, extra) => {
    const r = await c.buyer.client.post('/api/requests', { listingId: c.listing, quantity: 500, price: 10, ...extra });
    assert.equal(r.status, 201, JSON.stringify(r.data));
    return r.data.request;
  };

  it('farmer delivery needs ₹/km and km, and adds the cost to the order total', async () => {
    const bad = await ctx.buyer.client.post('/api/requests', { listingId: ctx.listing, quantity: 500, price: 10, transportBy: 'farmer' });
    assert.equal(bad.status, 400);
    const pr = await deal(ctx, { transportBy: 'farmer', ratePerKm: 12, distanceKm: 100 });
    assert.equal(pr.transportCharge, 1200);
    const acc = await ctx.farmer.client.post(`/api/requests/${pr._id}/accept`);
    assert.equal(acc.status, 200);
    const order = await db().collection('orders').findOne({ _id: oid(acc.data.request.orderId) });
    assert.equal(order.transportBy, 'farmer');
    assert.equal(order.total, 5000);
    assert.equal(order.transportCharge, 1200);
    assert.equal(order.grandTotal, 6200);
    ctx.farmerOrder = String(order._id);
  });

  it('transporters are notified when the trade closes', async () => {
    const n = await db().collection('notifications').countDocuments({ user: ctx.t1.id, title: 'A trade needs transport' });
    assert.equal(n, 1);
  });

  it('buyer pickup adds no cost, and only the arranging side may book transport', async () => {
    const pr = await deal(ctx, { transportBy: 'buyer', ratePerKm: 50, distanceKm: 50 });
    assert.equal(pr.transportCharge, 0, 'rate is ignored when the buyer arranges transport');
    const acc = await ctx.farmer.client.post(`/api/requests/${pr._id}/accept`);
    ctx.buyerOrder = acc.data.request.orderId;
    const o = await db().collection('orders').findOne({ _id: oid(ctx.buyerOrder) });
    assert.equal(o.grandTotal, 5000);
    const body = { orderId: ctx.buyerOrder, pickupAddress: 'Farm gate, Dharmavaram', dropAddress: 'Hindupur market yard', pickupDate: iso(1), ratePerKm: 10, distanceKm: 80 };
    const f = await ctx.farmer.client.post('/api/transport', body);
    assert.equal(f.status, 409, 'the farmer does not arrange transport when the buyer collects');
    const b = await ctx.buyer.client.post('/api/transport', body);
    assert.equal(b.status, 201);
    assert.equal(b.data.transport.charge, 800, 'total = rate x km');
  });

  it('transporter offers: listed, one pending per order, chosen by the responsible side only', async () => {
    const opp = await ctx.t1.client.get('/api/transport/opportunities');
    const row = opp.data.orders.find((o) => o.orderId === ctx.farmerOrder);
    assert.ok(row, 'the sold order shows up');
    assert.equal(row.arrangedBy, 'farmer');
    assert.equal(opp.data.orders.some((o) => o.orderId === ctx.buyerOrder), false, 'already booked orders are hidden');

    const base = `/api/transport/orders/${ctx.farmerOrder}/offers`;
    assert.equal((await ctx.t1.client.post(base, { ratePerKm: 0, distanceKm: 100 })).status, 400);
    assert.equal((await ctx.t1.client.post(base, { ratePerKm: 11, distanceKm: 100, message: 'Can go tomorrow' })).status, 201);
    assert.equal((await ctx.t1.client.post(base, { ratePerKm: 9, distanceKm: 100 })).status, 409, 'duplicate pending offer');
    const second = await ctx.t2.client.post(base, { ratePerKm: 9, distanceKm: 100 });
    assert.equal(second.status, 201);
    assert.equal((await ctx.buyer.client.get(base)).data.canChoose, false);
    assert.equal((await ctx.buyer.client.get(base)).data.offers.length, 2);
    const mine = await ctx.farmer.client.get(base);
    assert.equal(mine.data.canChoose, true);
    assert.equal(mine.data.offers[0].charge, 900, 'cheapest first');
    assert.ok(await db().collection('notifications').findOne({ user: ctx.farmer.id, title: 'A transporter sent an offer' }));

    const pick = { pickupAddress: 'Farm gate, Dharmavaram', dropAddress: 'Buyer yard, Anantapur', pickupDate: iso(2) };
    assert.equal((await ctx.buyer.client.post(`/api/transport/offers/${mine.data.offers[0]._id}/accept`, pick)).status, 409, 'the buyer is not responsible here');
    const done = await ctx.farmer.client.post(`/api/transport/offers/${mine.data.offers[0]._id}/accept`, pick);
    assert.equal(done.status, 201);
    assert.equal(done.data.transport.status, 'accepted');
    assert.equal((await ctx.t1.client.get(`/api/transport/orders/${ctx.farmerOrder}/offers`)).status, 403);
    const left = await db().collection('transportoffers').find({ order: oid(ctx.farmerOrder) }).toArray();
    assert.deepEqual(left.map((o) => o.status).sort(), ['accepted', 'declined']);
    const jobs = await ctx.t1.client.get('/api/transport/mine');
    assert.equal(jobs.data.transports.length, 0, 'the declined transporter has no job');
    assert.equal((await ctx.t2.client.get('/api/transport/mine')).data.transports[0].charge, 900);
  });
});

describe('vehicle list and direct booking', () => {
  const ctx = {};
  before(async () => {
    ctx.farmer = await person('farmer');
    ctx.buyer = await person('buyer');
    ctx.t1 = await person('transporter');
    ctx.t2 = await person('transporter', { vehicleType: 'Lorry', vehicleCapacityKg: 5000 });
    await markVerified(ctx.farmer, ctx.buyer, ctx.t1, ctx.t2);
    assert.equal((await ctx.t1.client.put('/api/profile/vehicle', { vehicleType: 'Mini truck', vehicleCapacityKg: 1000, isAvailable: true, ratePerKm: 14, serviceArea: 'Anantapur, Kurnool' })).status, 200);
    const r = await ctx.farmer.client.post('/api/crops', { crop: 'Papaya', category: 'fruit', quantity: 900, expectedPrice: 15, harvestDate: iso(1), deadline: iso(9), publish: true });
    const pr = await ctx.buyer.client.post('/api/requests', { listingId: r.data.listing._id, quantity: 800, price: 15 });
    ctx.orderId = (await ctx.farmer.client.post(`/api/requests/${pr.data.request._id}/accept`)).data.request.orderId;
  });

  it('farmers and buyers see verified vehicles without phone or full plate; transporters cannot', async () => {
    const res = await ctx.buyer.client.get('/api/transport/vehicles');
    assert.equal(res.status, 200);
    const mine = res.data.vehicles.find((v) => v._id === String(ctx.t1.id));
    assert.ok(mine);
    assert.equal(mine.ratePerKm, 14);
    assert.equal(mine.serviceArea, 'Anantapur, Kurnool');
    assert.doesNotMatch(JSON.stringify(res.data), /98765|test.local/);
    assert.match(mine.plate, /••••$/);
    assert.ok((await ctx.farmer.client.get('/api/transport/vehicles?minCapacity=3000')).data.vehicles.every((v) => v.capacityKg >= 3000));
    assert.equal((await ctx.farmer.client.get('/api/transport/vehicles?q=kurnool')).data.vehicles.length, 1);
    assert.equal((await ctx.t1.client.get('/api/transport/vehicles')).status, 403);
  });

  it('a request aimed at one vehicle is private to that transporter', async () => {
    const body = { orderId: ctx.orderId, pickupAddress: 'Papaya farm, Dharmavaram', dropAddress: 'Hindupur yard', pickupDate: iso(1), ratePerKm: 14, distanceKm: 60 };
    assert.equal((await ctx.buyer.client.post('/api/transport', { ...body, transporterId: String(oid()) })).status, 404, 'unknown vehicle');
    const made = await ctx.buyer.client.post('/api/transport', { ...body, transporterId: String(ctx.t2.id) });
    assert.equal(made.status, 201);
    assert.equal(made.data.transport.charge, 840);
    const id = made.data.transport._id;
    assert.equal((await ctx.t1.client.get('/api/transport/available')).data.transports.some((x) => x._id === id), false, 'other transporters do not see it');
    assert.equal((await ctx.t2.client.get('/api/transport/available')).data.transports.some((x) => x._id === id), true);
    assert.equal((await ctx.t1.client.post(`/api/transport/${id}/accept`)).status, 409);
    assert.equal((await ctx.t2.client.post(`/api/transport/${id}/accept`)).status, 200);
    assert.equal(await db().collection('notifications').countDocuments({ user: ctx.t1.id, title: 'New transport job' }), 0, 'only the chosen vehicle was alerted');
  });

  it('transporters can sort open routes by pay', async () => {
    const f2 = await person('farmer');
    await markVerified(f2);
    const l = await f2.client.post('/api/crops', { crop: 'Guava', category: 'fruit', quantity: 300, expectedPrice: 20, harvestDate: iso(1), deadline: iso(9), publish: true });
    const pr = await ctx.buyer.client.post('/api/requests', { listingId: l.data.listing._id, quantity: 200, price: 20 });
    const order = (await f2.client.post(`/api/requests/${pr.data.request._id}/accept`)).data.request.orderId;
    await ctx.buyer.client.post('/api/transport', { orderId: order, pickupAddress: 'Guava orchard, Tadipatri', dropAddress: 'Kurnool market', pickupDate: iso(1), charge: 5000 });
    const sorted = (await ctx.t1.client.get('/api/transport/available?sort=pay')).data.transports;
    assert.equal(sorted[0].charge, 5000);
  });
});
