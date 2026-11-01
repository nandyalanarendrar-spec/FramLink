import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { start, stop, person, markVerified, iso } from './helpers.js';

before(start);
after(stop);

describe('selling the unsold rest of a listing', () => {
  const ctx = {};
  before(async () => {
    ctx.farmer = await person('farmer');
    ctx.other = await person('farmer');
    ctx.buyer = await person('buyer');
    await markVerified(ctx.farmer, ctx.other, ctx.buyer);
    const l = await ctx.farmer.client.post('/api/crops', { crop: 'Leftover Tomato', category: 'vegetable', quantity: 800, expectedPrice: 24, harvestDate: iso(1), deadline: iso(2), publish: true });
    ctx.id = l.data.listing._id;
    // 500 kg sold, 300 kg left
    const pr = await ctx.buyer.client.post('/api/requests', { listingId: ctx.id, quantity: 500, price: 24 });
    await ctx.farmer.client.post(`/api/requests/${pr.data.request._id}/accept`);
  });

  it('lowering the price and extending the deadline keeps the stock and photos of the listing', async () => {
    const res = await ctx.farmer.client.post(`/api/crops/${ctx.id}/adjust`, { expectedPrice: 19, deadline: iso(7) });
    assert.equal(res.status, 200);
    assert.equal(res.data.listing.expectedPrice, 19);
    assert.equal(res.data.listing.availableQty, 300);
    assert.equal(res.data.listing.status, 'partially_sold');
    assert.ok(new Date(res.data.listing.deadline) > new Date(Date.now() + 5 * 864e5));
    const priceOnly = await ctx.farmer.client.post(`/api/crops/${ctx.id}/adjust`, { expectedPrice: 18 });
    assert.equal(priceOnly.data.listing.expectedPrice, 18);
  });

  it('refuses empty, bad, past, other farmers and finished listings', async () => {
    const url = `/api/crops/${ctx.id}/adjust`;
    assert.equal((await ctx.farmer.client.post(url, {})).status, 400, 'nothing to change');
    assert.equal((await ctx.farmer.client.post(url, { expectedPrice: -5 })).status, 400);
    assert.equal((await ctx.farmer.client.post(url, { deadline: iso(-2) })).status, 400);
    assert.equal((await ctx.other.client.post(url, { expectedPrice: 10 })).status, 404);
    assert.equal((await ctx.buyer.client.post(url, { expectedPrice: 10 })).status, 403);
    await ctx.farmer.client.patch(`/api/crops/${ctx.id}/status`, { status: 'withdrawn' });
    assert.equal((await ctx.farmer.client.post(url, { expectedPrice: 10 })).status, 400, 'a withdrawn listing is relisted, not adjusted');
  });

  it('a buyer wanting that crop shows on the board next to the farmer own listing so the rest can be offered', async () => {
    const f = await person('farmer');
    await markVerified(f);
    const l = await f.client.post('/api/crops', { crop: 'Leftover Tomato', category: 'vegetable', quantity: 300, expectedPrice: 20, harvestDate: iso(1), deadline: iso(4), publish: true });
    await ctx.buyer.client.post('/api/demands', { crop: 'Leftover Tomato', quantity: 250, maxPrice: 21, neededBy: iso(5), deliverTo: 'Kurnool market' });
    const row = (await f.client.get('/api/demands/board?q=leftover%20tomato')).data.demands.find((d) => d.crop === 'Leftover Tomato');
    assert.ok(row);
    assert.equal(row.matching[0]._id, l.data.listing._id);
    const offer = await f.client.post(`/api/demands/${row._id}/offers`, { listingId: l.data.listing._id, quantity: 250, price: 20 });
    assert.equal(offer.status, 201);
  });
});
