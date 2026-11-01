import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { start, stop, db, oid, person, markVerified, iso } from './helpers.js';

before(start);
after(stop);

describe('transport: actual kilometres, final cost, delivery and payment status', () => {
  const ctx = {};
  const makeOrder = async () => {
    const l = await ctx.farmer.client.post('/api/crops', { crop: 'Billing Tomato', category: 'vegetable', quantity: 400, expectedPrice: 20, harvestDate: iso(1), deadline: iso(9), publish: true });
    const pr = await ctx.buyer.client.post('/api/requests', { listingId: l.data.listing._id, quantity: 300, price: 20 });
    const orderId = (await ctx.farmer.client.post(`/api/requests/${pr.data.request._id}/accept`)).data.request.orderId;
    await ctx.farmer.client.patch(`/api/orders/${orderId}/status`, { status: 'ready_for_pickup' });
    return orderId;
  };
  // book at ₹10/km for an agreed 100 km, assigned to ctx.trans
  const book = async (extra = {}) => {
    const orderId = await makeOrder();
    const made = await ctx.buyer.client.post('/api/transport', { orderId, pickupAddress: 'Farm gate, Dharmavaram', dropAddress: 'Hindupur market', pickupDate: iso(1), ratePerKm: 10, distanceKm: 100, ...extra });
    assert.equal(made.status, 201, JSON.stringify(made.data));
    const id = made.data.transport._id;
    assert.equal((await ctx.trans.client.post(`/api/transport/${id}/accept`)).status, 200);
    return { id, orderId };
  };

  before(async () => {
    ctx.farmer = await person('farmer');
    ctx.buyer = await person('buyer');
    ctx.trans = await person('transporter');
    ctx.other = await person('transporter');
    await markVerified(ctx.farmer, ctx.buyer, ctx.trans, ctx.other);
  });

  it('a per-km job needs the real kilometres on delivery, and the bill follows them', async () => {
    const { id } = await book();
    const t = ctx.trans.client;
    const picked = await t.patch(`/api/transport/${id}/status`, { status: 'picked_up' });
    assert.equal(picked.status, 200);
    assert.ok(picked.data.transport.pickedUpAt, 'pickup is timestamped');

    assert.equal((await t.patch(`/api/transport/${id}/status`, { status: 'delivered' })).status, 400, 'kilometres are required');
    assert.equal((await t.patch(`/api/transport/${id}/status`, { status: 'delivered', actualKm: 140 })).status, 409, 'more than 30% above the agreed distance');
    assert.equal((await t.patch(`/api/transport/${id}/status`, { status: 'delivered', actualKm: -3 })).status, 400);

    const done = await t.patch(`/api/transport/${id}/status`, { status: 'delivered', actualKm: 104 });
    assert.equal(done.status, 200);
    const tr = done.data.transport;
    assert.equal(tr.actualKm, 104);
    assert.equal(tr.finalCharge, 1040, '₹10 x 104 km');
    assert.equal(tr.charge, 1000, 'the agreed estimate is kept for comparison');
    assert.ok(tr.deliveredAt);
    assert.equal(tr.paymentStatus ?? 'pending', 'pending');
    const bill = await db().collection('notifications').findOne({ user: ctx.buyer.id, title: 'Transport bill' });
    assert.ok(bill, 'the person paying is told the final cost');
    assert.match(bill.message, /1,040/);
  });

  it('a shorter drive costs less, and a flat-price job bills its agreed charge', async () => {
    const { id } = await book();
    await ctx.trans.client.patch(`/api/transport/${id}/status`, { status: 'picked_up' });
    const short = await ctx.trans.client.patch(`/api/transport/${id}/status`, { status: 'delivered', actualKm: 80 });
    assert.equal(short.data.transport.finalCharge, 800);

    const orderId = await makeOrder();
    const flat = await ctx.buyer.client.post('/api/transport', { orderId, pickupAddress: 'Farm gate, Dharmavaram', dropAddress: 'Kurnool yard', pickupDate: iso(1), charge: 1500 });
    await ctx.trans.client.post(`/api/transport/${flat.data.transport._id}/accept`);
    await ctx.trans.client.patch(`/api/transport/${flat.data.transport._id}/status`, { status: 'picked_up' });
    const doneFlat = await ctx.trans.client.patch(`/api/transport/${flat.data.transport._id}/status`, { status: 'delivered' });
    assert.equal(doneFlat.status, 200, 'no kilometres needed for a flat price');
    assert.equal(doneFlat.data.transport.finalCharge, 1500);
  });

  it('only the transporter marks payment, only after delivery, only once; summaries split paid and pending', async () => {
    const { id } = await book();
    const t = ctx.trans.client;
    assert.equal((await t.post(`/api/transport/${id}/paid`)).status, 409, 'not delivered yet');
    await t.patch(`/api/transport/${id}/status`, { status: 'picked_up' });
    await t.patch(`/api/transport/${id}/status`, { status: 'delivered', actualKm: 100 });

    assert.equal((await ctx.buyer.client.post(`/api/transport/${id}/paid`)).status, 403, 'the payer cannot mark themselves paid');
    assert.equal((await ctx.other.client.post(`/api/transport/${id}/paid`)).status, 409, 'not their job');
    const before = (await t.get('/api/transport/mine?tab=history')).data.summary;
    assert.ok(before.pending >= 1000);

    const paid = await t.post(`/api/transport/${id}/paid`);
    assert.equal(paid.status, 200);
    assert.equal(paid.data.transport.paymentStatus, 'paid');
    assert.ok(paid.data.transport.paidAt);
    assert.equal((await t.post(`/api/transport/${id}/paid`)).status, 409, 'only once');

    const after = (await t.get('/api/transport/mine?tab=history')).data.summary;
    assert.equal(after.received, before.received + 1000);
    assert.equal(after.pending, before.pending - 1000);
    assert.equal(after.amount, after.received + after.pending);
    assert.ok(await db().collection('notifications').findOne({ user: ctx.buyer.id, title: 'Transport payment recorded' }));

    // the buyer sees what they paid, split the same way
    const spent = (await ctx.buyer.client.get('/api/transport/mine?tab=history')).data.summary;
    assert.ok(spent.amount >= 1000 && spent.received >= 1000);
    assert.equal((await db().collection('transportrequests').countDocuments({ _id: oid(id), paymentStatus: 'paid' })), 1);
  });
});
