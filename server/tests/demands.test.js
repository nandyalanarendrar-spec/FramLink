import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { start, stop, db, oid, Client, person, markVerified, iso } from './helpers.js';

before(start);
after(stop);

describe('buyers post wanted requests, farmers answer, buyer confirms', () => {
  const ctx = {};
  const want = (extra = {}) => ctx.buyer.client.post('/api/demands', { crop: 'Tomato', quantity: 1000, maxPrice: 22, neededBy: iso(6), deliverTo: 'Anantapur market', ...extra });
  const list = (farmer, extra = {}) => farmer.client.post('/api/crops', { crop: 'Tomato', category: 'vegetable', quantity: 800, expectedPrice: 20, harvestDate: iso(1), deadline: iso(9), publish: true, ...extra });

  before(async () => {
    ctx.buyer = await person('buyer');
    ctx.f1 = await person('farmer');
    ctx.f2 = await person('farmer');
    ctx.f3 = await person('farmer'); // has no tomato listing
    ctx.trans = await person('transporter');
    await markVerified(ctx.buyer, ctx.f1, ctx.f2, ctx.f3, ctx.trans);
    ctx.l1 = (await list(ctx.f1)).data.listing._id;
    ctx.l2 = (await list(ctx.f2, { minOrderQty: 100 })).data.listing._id;
  });

  it('only buyers post; bad input is refused; farmers with that crop hear about it', async () => {
    assert.equal((await ctx.f1.client.post('/api/demands', { crop: 'Tomato', quantity: 10, maxPrice: 20, neededBy: iso(3), deliverTo: 'Somewhere' })).status, 403);
    assert.equal((await want({ quantity: 0 })).status, 400);
    assert.equal((await want({ neededBy: iso(-2) })).status, 400);
    assert.equal((await want({ deliverTo: 'x' })).status, 400);
    const res = await want();
    assert.equal(res.status, 201);
    ctx.demand = res.data.demand._id;
    assert.ok(await db().collection('notifications').findOne({ user: ctx.f1.id, title: 'A buyer wants your crop' }));
    assert.equal(await db().collection('notifications').countDocuments({ user: ctx.f3.id, title: 'A buyer wants your crop' }), 0, 'farmers without that crop are not pinged');
  });

  it('every farmer sees the board without contact details, with their own matching listings', async () => {
    const mine = (await ctx.f1.client.get('/api/demands/board')).data.demands.find((d) => d._id === ctx.demand);
    assert.ok(mine);
    assert.equal(mine.remaining, 1000);
    assert.equal(mine.matching.length, 1);
    assert.equal(mine.matching[0]._id, ctx.l1);
    assert.doesNotMatch(JSON.stringify(mine), /test\.local|98765/);
    const other = (await ctx.f3.client.get('/api/demands/board')).data.demands.find((d) => d._id === ctx.demand);
    assert.ok(other, 'visible to every farmer');
    assert.equal(other.matching.length, 0);
    assert.equal((await ctx.f1.client.get('/api/demands/board?q=onion')).data.demands.some((d) => d._id === ctx.demand), false);
    assert.equal((await ctx.f1.client.get('/api/demands/board?place=anantapur')).data.demands.some((d) => d._id === ctx.demand), true);
    assert.equal((await ctx.buyer.client.get('/api/demands/board')).status, 403);
  });

  it('offer rules: own live listing of that crop, within the max price, quantity and stock', async () => {
    const f = ctx.f1.client, url = `/api/demands/${ctx.demand}/offers`;
    assert.equal((await f.post(url, { listingId: ctx.l1, quantity: 500, price: 25 })).status, 400, 'above the buyer maximum');
    assert.equal((await f.post(url, { listingId: ctx.l1, quantity: 2000, price: 20 })).status, 400, 'more than the buyer needs');
    assert.equal((await f.post(url, { listingId: ctx.l1, quantity: 900, price: 20 })).status, 400, 'more than the listing has');
    assert.equal((await f.post(url, { listingId: ctx.l2, quantity: 100, price: 20 })).status, 404, "someone else's listing");
    const onion = (await list(ctx.f1, { crop: 'Onion' })).data.listing._id;
    assert.equal((await f.post(url, { listingId: onion, quantity: 100, price: 20 })).status, 400, 'different crop');
    assert.equal((await f.post(url, { listingId: ctx.l1, quantity: 100, price: 20, transportBy: 'farmer' })).status, 400, 'delivery needs rate and km');
    assert.equal((await ctx.buyer.client.post(url, { listingId: ctx.l1, quantity: 100, price: 20 })).status, 403);

    const ok = await f.post(url, { listingId: ctx.l1, quantity: 600, price: 20, transportBy: 'farmer', ratePerKm: 10, distanceKm: 60, message: 'Fresh picked' });
    assert.equal(ok.status, 201);
    ctx.o1 = ok.data.offer._id;
    assert.equal((await f.post(url, { listingId: ctx.l1, quantity: 100, price: 20 })).status, 409, 'one pending offer per farmer');
    assert.ok(await db().collection('notifications').findOne({ user: ctx.buyer.id, title: 'A farmer answered your request' }));
  });

  it('the buyer sees offers with transport added to the total', async () => {
    const o2 = await ctx.f2.client.post(`/api/demands/${ctx.demand}/offers`, { listingId: ctx.l2, quantity: 500, price: 21 });
    assert.equal(o2.status, 201);
    ctx.o2 = o2.data.offer._id;
    const view = (await ctx.buyer.client.get(`/api/demands/${ctx.demand}`)).data;
    assert.equal(view.offers.length, 2);
    const first = view.offers.find((o) => o._id === ctx.o1);
    assert.equal(first.transportCharge, 600);
    assert.equal(first.grandTotal, 600 * 20 + 600);
    assert.equal(view.offers.find((o) => o._id === ctx.o2).grandTotal, 500 * 21);
    assert.equal((await ctx.f1.client.get(`/api/demands/${ctx.demand}`)).status, 403, 'farmers read offers on the board, not the buyer view');
    assert.equal((await (await person('buyer')).client.get(`/api/demands/${ctx.demand}`)).status, 403, 'unverified buyer');
  });

  it('accepting reserves stock, creates an order with the transport cost, and pings transporters', async () => {
    const res = await ctx.buyer.client.post(`/api/demands/offers/${ctx.o1}/accept`);
    assert.equal(res.status, 200);
    assert.equal(res.data.filled, false);
    const order = await db().collection('orders').findOne({ _id: oid(res.data.orderId) });
    assert.equal(order.quantity, 600);
    assert.equal(order.total, 12000);
    assert.equal(order.transportBy, 'farmer');
    assert.equal(order.transportCharge, 600);
    assert.equal(order.grandTotal, 12600);
    assert.equal(String(order.farmer), String(ctx.f1.id));
    const stock = (await db().collection('croplistings').findOne({ _id: oid(ctx.l1) })).availableQty;
    assert.equal(stock, 200);
    const demand = await db().collection('demands').findOne({ _id: oid(ctx.demand) });
    assert.equal(demand.filledQty, 600);
    assert.equal(demand.isOpen, true);
    assert.ok(await db().collection('notifications').findOne({ user: ctx.trans.id, title: 'A trade needs transport' }));
    assert.ok(await db().collection('notifications').findOne({ user: ctx.f1.id, title: 'Your offer was accepted' }));
    // the normal order screens work for it
    assert.equal((await ctx.f1.client.get(`/api/orders/${res.data.orderId}`)).status, 200);
    assert.equal((await ctx.buyer.client.post(`/api/demands/offers/${ctx.o1}/accept`)).status, 404, 'cannot accept twice');
  });

  it('an offer bigger than what is still needed cannot be accepted; a smaller one fills the request', async () => {
    assert.equal((await ctx.buyer.client.post(`/api/demands/offers/${ctx.o2}/accept`)).status, 409, '500 kg offered but only 400 kg still needed');
    assert.equal((await ctx.buyer.client.post(`/api/demands/offers/${ctx.o2}/decline`)).status, 200);
    const small = await ctx.f2.client.post(`/api/demands/${ctx.demand}/offers`, { listingId: ctx.l2, quantity: 400, price: 19 });
    assert.equal(small.status, 201);
    const other = await ctx.f1.client.post(`/api/demands/${ctx.demand}/offers`, { listingId: ctx.l1, quantity: 150, price: 20 });
    assert.equal(other.status, 201);
    const res = await ctx.buyer.client.post(`/api/demands/offers/${small.data.offer._id}/accept`);
    assert.equal(res.status, 200);
    assert.equal(res.data.filled, true);
    const d = await db().collection('demands').findOne({ _id: oid(ctx.demand) });
    assert.equal(d.status, 'filled');
    assert.equal(d.isOpen, false);
    const left = await db().collection('demandoffers').findOne({ _id: oid(other.data.offer._id) });
    assert.equal(left.status, 'declined', 'other pending offers are closed when the request is filled');
    assert.equal((await ctx.f1.client.get('/api/demands/board')).data.demands.some((x) => x._id === ctx.demand), false, 'filled requests leave the board');
    assert.equal((await ctx.f2.client.post(`/api/demands/${ctx.demand}/offers`, { listingId: ctx.l2, quantity: 10, price: 19 })).status, 404);
  });

  it('two offers racing for the last kilos: exactly one wins', async () => {
    const f4 = await person('farmer'), f5 = await person('farmer');
    await markVerified(f4, f5);
    const a = (await list(f4)).data.listing._id, b = (await list(f5)).data.listing._id;
    const dem = (await want({ quantity: 300 })).data.demand._id;
    const o4 = await f4.client.post(`/api/demands/${dem}/offers`, { listingId: a, quantity: 250, price: 20 });
    const o5 = await f5.client.post(`/api/demands/${dem}/offers`, { listingId: b, quantity: 250, price: 20 });
    const [r1, r2] = await Promise.all([ctx.buyer.client.post(`/api/demands/offers/${o4.data.offer._id}/accept`), ctx.buyer.client.post(`/api/demands/offers/${o5.data.offer._id}/accept`)]);
    assert.deepEqual([r1.status, r2.status].sort(), [200, 409]);
    assert.equal((await db().collection('demands').findOne({ _id: oid(dem) })).filledQty, 250);
  });

  it('withdraw, decline and close keep everyone informed; limits apply', async () => {
    const dem = (await want({ quantity: 200 })).data.demand._id;
    const off = await ctx.f1.client.post(`/api/demands/${dem}/offers`, { listingId: ctx.l1, quantity: 100, price: 20 });
    assert.equal((await ctx.f2.client.post(`/api/demands/offers/${off.data.offer._id}/withdraw`)).status, 404, 'only the owner withdraws');
    assert.equal((await ctx.f1.client.post(`/api/demands/offers/${off.data.offer._id}/withdraw`)).status, 200);
    const again = await ctx.f1.client.post(`/api/demands/${dem}/offers`, { listingId: ctx.l1, quantity: 100, price: 20 });
    assert.equal(again.status, 201, 'a new offer is fine after withdrawing');
    assert.equal((await ctx.buyer.client.post(`/api/demands/${dem}/close`)).status, 200);
    assert.equal((await db().collection('demandoffers').findOne({ _id: oid(again.data.offer._id) })).status, 'declined');
    assert.equal((await ctx.buyer.client.post(`/api/demands/${dem}/close`)).status, 404, 'already closed');
    const mine = (await ctx.f1.client.get('/api/demands/offers/mine')).data.offers;
    assert.ok(mine.length >= 3);
    assert.ok(mine.every((o) => o.demand?.crop));

    const solo = await person('buyer');
    await markVerified(solo);
    for (let i = 0; i < 5; i++) assert.equal((await solo.client.post('/api/demands', { crop: `Crop ${i}`, quantity: 10, maxPrice: 10, neededBy: iso(3), deliverTo: 'Somewhere' })).status, 201);
    assert.equal((await solo.client.post('/api/demands', { crop: 'Crop 6', quantity: 10, maxPrice: 10, neededBy: iso(3), deliverTo: 'Somewhere' })).status, 400, 'at most 5 open requests');
    assert.equal((await new Client().get('/api/demands/board')).status, 401);
  });
});
