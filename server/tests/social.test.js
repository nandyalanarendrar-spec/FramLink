import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { start, stop, db, oid, Client, person, markVerified, admin, iso } from './helpers.js';

before(start);
after(stop);

describe('ratings between farmers, buyers and transporters', () => {
  const ctx = {};
  const mkOrder = async (delivered) => {
    const l = await ctx.farmer.client.post('/api/crops', { crop: 'Cucumber', category: 'vegetable', quantity: 400, expectedPrice: 12, harvestDate: iso(1), deadline: iso(9), publish: true });
    const pr = await ctx.buyer.client.post('/api/requests', { listingId: l.data.listing._id, quantity: 100, price: 12 });
    const orderId = (await ctx.farmer.client.post(`/api/requests/${pr.data.request._id}/accept`)).data.request.orderId;
    if (delivered) {
      await db().collection('orders').updateOne({ _id: oid(orderId) }, { $set: { status: 'delivered' } });
      await db().collection('transportrequests').insertOne({ order: oid(orderId), farmer: ctx.farmer.id, buyer: ctx.buyer.id, transporter: ctx.trans.id, crop: 'Cucumber', weightKg: 100, pickupAddress: 'a', dropAddress: 'b', pickupDate: new Date(), charge: 500, status: 'delivered', isActive: false, timeline: [], createdAt: new Date(), updatedAt: new Date() });
    }
    return orderId;
  };
  before(async () => {
    ctx.farmer = await person('farmer');
    ctx.buyer = await person('buyer');
    ctx.trans = await person('transporter');
    ctx.stranger = await person('buyer');
    await markVerified(ctx.farmer, ctx.buyer, ctx.trans, ctx.stranger);
  });

  it('nobody can be rated before the order is delivered', async () => {
    const early = await mkOrder(false);
    const r = await ctx.farmer.client.post('/api/ratings', { orderId: early, target: 'buyer', stars: 5 });
    assert.equal(r.status, 409);
    assert.equal((await ctx.farmer.client.get(`/api/ratings/order/${early}`)).data.open, false);
  });

  it('every party rates the others once; strangers and self-ratings are refused', async () => {
    const id = await mkOrder(true);
    const t = (c, target, stars, extra = {}) => c.client.post('/api/ratings', { orderId: id, target, stars, ...extra });
    assert.equal((await t(ctx.farmer, 'buyer', 5, { comment: 'Pays on time' })).status, 201);
    assert.equal((await t(ctx.farmer, 'buyer', 1)).status, 409, 'only once per person per order');
    assert.equal((await t(ctx.farmer, 'farmer', 5)).status, 400, 'not yourself');
    assert.equal((await t(ctx.farmer, 'buyer', 6)).status, 400, 'stars are 1 to 5');
    assert.equal((await t(ctx.buyer, 'farmer', 4)).status, 201);
    assert.equal((await t(ctx.buyer, 'transporter', 3)).status, 201);
    assert.equal((await t(ctx.farmer, 'transporter', 5)).status, 201);
    assert.equal((await t(ctx.trans, 'farmer', 4)).status, 201);
    assert.equal((await t(ctx.trans, 'buyer', 2)).status, 201);
    assert.equal((await t(ctx.stranger, 'farmer', 1)).status, 404, 'not on this order');
    assert.equal((await t({ client: new Client() }, 'farmer', 1)).status, 401);

    const view = (await ctx.farmer.client.get(`/api/ratings/order/${id}`)).data;
    assert.equal(view.open, true);
    assert.equal(view.targets.length, 2);
    assert.ok(view.targets.every((x) => x.given));
  });

  it('scores add up and show up where people choose each other', async () => {
    const me = (await ctx.trans.client.get('/api/ratings/me')).data;
    assert.equal(me.rating.count, 2);
    assert.equal(me.rating.avg, 4);
    assert.equal(me.recent.length, 2);
    const buyerScore = (await ctx.buyer.client.get('/api/ratings/me')).data.rating;
    assert.deepEqual(buyerScore, { avg: 3.5, count: 2 });

    const vehicles = (await ctx.farmer.client.get('/api/transport/vehicles')).data.vehicles;
    assert.deepEqual(vehicles.find((v) => v._id === String(ctx.trans.id)).rating, { avg: 4, count: 2 });
    const orders = await ctx.farmer.client.get('/api/orders/mine');
    assert.equal(orders.data.orders[0].counterpart.rating.avg, 3.5);
  });

  it('the buyer rating when confirming receipt counts too, and admins have no ratings', async () => {
    const id = await mkOrder(true);
    const done = await ctx.buyer.client.post(`/api/orders/${id}/complete`, { stars: 5, comment: 'Great' });
    assert.equal(done.status, 200);
    assert.equal((await ctx.buyer.client.post('/api/ratings', { orderId: id, target: 'farmer', stars: 1 })).status, 409, 'already rated while confirming');
    const adm = await admin();
    assert.equal((await adm.get('/api/ratings/me')).status, 403);
  });
});

describe('editing profiles', () => {
  it('password: wrong current, weak new and same-as-old are refused; the new one works', async () => {
    const p = await person('buyer');
    const c = p.client;
    assert.equal((await c.post('/api/auth/change-password', { currentPassword: 'Nope12345', newPassword: 'Another123' })).status, 400);
    assert.equal((await c.post('/api/auth/change-password', { currentPassword: 'Passw0rd1', newPassword: 'short1' })).status, 400);
    assert.equal((await c.post('/api/auth/change-password', { currentPassword: 'Passw0rd1', newPassword: 'Passw0rd1' })).status, 400);
    assert.equal((await c.post('/api/auth/change-password', { currentPassword: 'Passw0rd1', newPassword: 'Another123' })).status, 200);
    assert.equal((await new Client().post('/api/auth/login', { identifier: p.email, password: 'Passw0rd1' })).status, 401);
    assert.equal((await new Client().post('/api/auth/login', { identifier: p.email, password: 'Another123' })).status, 200);
  });

  it('name and phone can change; a taken or invalid phone cannot', async () => {
    const a = await person('buyer');
    const b = await person('buyer');
    const taken = (await a.client.get('/api/auth/me')).data.user.phone;
    assert.equal((await b.client.put('/api/profile/account', { name: 'New Name', phone: taken })).status, 409);
    assert.equal((await b.client.put('/api/profile/account', { name: 'New Name', phone: '12345' })).status, 400);
    assert.equal((await b.client.put('/api/profile/account', { name: 'New Name', phone: '9123456789' })).status, 200);
    const me = (await b.client.get('/api/auth/me')).data.user;
    assert.equal(me.name, 'New Name');
    assert.equal(me.phone, '9123456789');
  });

  it('farmers and buyers edit everyday details even after verification; transporters are pointed to the vehicle page', async () => {
    const f = await person('farmer'), b = await person('buyer'), t = await person('transporter');
    await markVerified(f, b, t);
    const fr = await f.client.put('/api/profile/basic', { farmSizeAcres: 7.5, farmAddress: 'New survey 9, Dharmavaram', district: 'Anantapur', village: 'Dharmavaram' });
    assert.equal(fr.status, 200);
    assert.equal(fr.data.details.farmSizeAcres, 7.5);
    assert.equal((await f.client.put('/api/profile/basic', { farmSizeAcres: -1, farmAddress: 'x', district: 'a', village: 'b' })).status, 400);
    const br = await b.client.put('/api/profile/basic', { buyerType: 'wholesaler', businessName: 'Reddy Traders', businessAddress: 'Main road, Hindupur' });
    assert.equal(br.status, 200);
    assert.equal(br.data.details.businessName, 'Reddy Traders');
    assert.equal((await t.client.put('/api/profile/basic', {})).status, 400);
  });

  it('ID details lock after verification; unlocking returns the account to pending until re-approved', async () => {
    const f = await person('farmer');
    await markVerified(f);
    assert.equal((await f.client.put('/api/profile/verification', { idType: 'farmer_id', idNumber: 'AP999999', farmSizeAcres: 2, farmAddress: 'Somewhere 12' })).status, 403);
    assert.equal((await f.client.post('/api/profile/unlock')).status, 200);
    assert.equal((await f.client.post('/api/profile/unlock')).status, 409, 'already editable');
    const crop = { crop: 'Tomato', category: 'vegetable', quantity: 10, expectedPrice: 20, harvestDate: iso(1), deadline: iso(5) };
    assert.equal((await f.client.post('/api/crops', crop)).status, 403, 'cannot trade while waiting for re-approval');
    assert.equal((await f.client.get('/api/profile')).data.verification.status, 'pending');
  });
});
