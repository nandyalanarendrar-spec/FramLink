import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { start, stop, db, oid, person, markVerified, iso, PNG } from './helpers.js';

before(start);
after(stop);

const DAY = 864e5;
const midnight = (daysAgo) => new Date(Math.floor((Date.now() - daysAgo * DAY) / DAY) * DAY);
const listing = (c, extra = {}) =>
  c.client.post('/api/crops', { crop: 'Tomato', category: 'vegetable', quantity: 500, expectedPrice: 20, harvestDate: iso(1), deadline: iso(5), publish: true, ...extra });
const notes = (userId, title) => db().collection('notifications').find({ user: userId, ...(title && { title: new RegExp(title) }) }).toArray();

async function addPrices(crop, district, rows) {
  await db().collection('marketprices').insertMany(
    rows.map(([daysAgo, price], i) => ({
      crop, cropKey: crop.toLowerCase(), market: `${district} Mandi ${i}`, district, state: 'Andhra Pradesh',
      minPrice: price - 1, maxPrice: price + 1, modalPrice: price, unit: 'kg', date: midnight(daysAgo), source: 'admin', createdAt: new Date(), updatedAt: new Date(),
    }))
  );
}

describe('relist', () => {
  const ctx = {};
  before(async () => {
    ctx.farmer = await person('farmer');
    ctx.other = await person('farmer');
    await markVerified(ctx.farmer, ctx.other);
    const r = await listing(ctx.farmer, { description: 'Fresh from the field' });
    ctx.src = r.data.listing._id;
    await ctx.farmer.client.upload(`/api/crops/${ctx.src}/images`, 'images', [['a.png', PNG, 'image/png']]);
  });

  it('a live or finished listing relists in one call with today and a new deadline', async () => {
    await ctx.farmer.client.patch(`/api/crops/${ctx.src}/status`, { status: 'withdrawn' });
    const res = await ctx.farmer.client.post(`/api/crops/${ctx.src}/relist`, { quantity: 800, expectedPrice: 22 });
    assert.equal(res.status, 201);
    const l = res.data.listing;
    assert.notEqual(l._id, ctx.src);
    assert.equal(l.status, 'active');
    assert.equal(l.quantity, 800);
    assert.equal(l.availableQty, 800);
    assert.equal(l.expectedPrice, 22);
    assert.equal(l.description, 'Fresh from the field');
    assert.equal(l.images.length, 1);
    const old = (await ctx.farmer.client.get(`/api/crops/${ctx.src}`)).data.listing;
    assert.notEqual(l.images[0], old.images[0], 'photos are copied, not shared');
    assert.ok(new Date(l.deadline) > new Date(), 'a fresh deadline');
  });

  it('defaults come from the old listing; bad input and other farmers are refused', async () => {
    const res = await ctx.farmer.client.post(`/api/crops/${ctx.src}/relist`, { publish: false });
    assert.equal(res.status, 201);
    assert.equal(res.data.listing.status, 'draft');
    assert.equal(res.data.listing.quantity, 500);
    assert.equal((await ctx.farmer.client.post(`/api/crops/${ctx.src}/relist`, { deadline: iso(-3) })).status, 400);
    assert.equal((await ctx.other.client.post(`/api/crops/${ctx.src}/relist`, {})).status, 404);
    assert.equal((await ctx.farmer.client.post(`/api/crops/${res.data.listing._id}/relist`, {})).status, 400, 'a draft is edited, not relisted');
  });
});

describe('daily reminders', () => {
  const ctx = {};
  let run;
  before(async () => {
    ({ runReminders: run } = await import('../src/services/reminders.js'));
    ctx.farmer = await person('farmer');
    await markVerified(ctx.farmer);
  });

  it('warns about deadlines once per stage, only for listings with stock', async () => {
    const soon = (await listing(ctx.farmer, { crop: 'Deadline Tomato', deadline: iso(2) })).data.listing._id;
    await listing(ctx.farmer, { crop: 'Far Away Crop', deadline: iso(12) });
    const sold = (await listing(ctx.farmer, { crop: 'Sold Out Crop', deadline: iso(2) })).data.listing._id;
    await db().collection('croplistings').updateOne({ _id: oid(sold) }, { $set: { availableQty: 0, status: 'sold_out' } });

    const first = await run();
    assert.equal(first.deadline, 1);
    const got = await notes(ctx.farmer.id, 'Deadline Tomato');
    assert.equal(got.length, 1);
    assert.match(got[0].title, /ends in 2 days/);
    assert.equal(got[0].link, `/farmer/crops/${soon}/leftover`);
    assert.equal((await run()).deadline, 0, 'same day, same stage: nothing again');

    // two days later the same listing is one day from its deadline: a new stage, a new message
    const later = new Date(Date.now() + DAY);
    assert.equal((await run(later)).deadline, 1);
    assert.match((await notes(ctx.farmer.id, 'Deadline Tomato')).map((n) => n.title).join('|'), /ends tomorrow/);
  });

  it('reminds about a harvest day for drafts only', async () => {
    await listing(ctx.farmer, { crop: 'Harvest Mango', harvestDate: iso(1), publish: false });
    await listing(ctx.farmer, { crop: 'Live Mango', harvestDate: iso(1), publish: true });
    const r = await run();
    assert.equal(r.harvest, 1);
    assert.equal((await notes(ctx.farmer.id, 'Harvest Mango')).length, 1);
    assert.equal((await notes(ctx.farmer.id, 'Live Mango')).length, 0);
  });

  it('tells a farmer when the price of their crop moves 10% or more this week', async () => {
    await listing(ctx.farmer, { crop: 'Move Onion', deadline: iso(20) });
    await listing(ctx.farmer, { crop: 'Steady Maize', deadline: iso(20) });
    await addPrices('Move Onion', 'Anantapur', [[5, 20], [6, 20], [0, 26], [1, 26]]); // +30%
    await addPrices('Steady Maize', 'Anantapur', [[5, 20], [6, 20], [0, 21], [1, 21]]); // +5%
    const r = await run();
    assert.equal(r.price, 1);
    const up = await notes(ctx.farmer.id, 'Move Onion');
    assert.equal(up.length, 1);
    assert.match(up[0].title, /up 30%/);
    assert.match(up[0].message, /Anantapur/);
    assert.equal((await notes(ctx.farmer.id, 'Steady Maize')).length, 0);
    assert.equal((await run()).price, 0, 'not repeated within three days');
  });
});

describe('best time to sell', () => {
  const ctx = {};
  before(async () => {
    ctx.farmer = await person('farmer');
    await markVerified(ctx.farmer);
  });
  const outlook = (crop, district) => ctx.farmer.client.get(`/api/prices/outlook?crop=${encodeURIComponent(crop)}${district ? `&district=${district}` : ''}`);

  it('says there is not enough data instead of guessing', async () => {
    await addPrices('Thin Crop', 'Anantapur', [[1, 20], [2, 21]]);
    const res = await outlook('Thin Crop');
    assert.equal(res.status, 200);
    assert.equal(res.data.verdict, null);
  });

  it('good when the latest price is well above the 30-day average, low when well below', async () => {
    const rising = [];
    for (let d = 29; d >= 3; d--) rising.push([d, 20]);
    rising.push([2, 26], [1, 26], [0, 26]);
    await addPrices('Rising Crop', 'Anantapur', rising);
    const up = (await outlook('Rising Crop')).data;
    assert.equal(up.verdict, 'good');
    assert.ok(up.changePct > 5);
    assert.equal(up.latest, 26);
    assert.equal(up.bestWeekday, null, 'a price jump is a trend, not a weekday habit');

    const falling = [];
    for (let d = 29; d >= 3; d--) falling.push([d, 30]);
    falling.push([2, 22], [1, 22], [0, 22]);
    await addPrices('Falling Crop', 'Anantapur', falling);
    assert.equal((await outlook('Falling Crop')).data.verdict, 'low');

    const flat = [];
    for (let d = 29; d >= 0; d--) flat.push([d, 25]);
    await addPrices('Flat Crop', 'Anantapur', flat);
    assert.equal((await outlook('Flat Crop')).data.verdict, 'normal');
  });

  it('finds the weekday that usually pays more, and uses the district when it has enough data', async () => {
    const rows = [];
    for (let d = 55; d >= 0; d--) rows.push([d, new Date(midnight(d)).getUTCDay() === 6 ? 30 : 24]); // Saturdays pay more
    await addPrices('Weekday Crop', 'Kurnool', rows);
    const res = (await outlook('Weekday Crop', 'Kurnool')).data;
    assert.equal(res.scope, 'Kurnool');
    assert.equal(res.bestWeekday.day, 6);
    assert.ok(res.bestWeekday.upliftPct > 2);
    assert.equal((await outlook('Weekday Crop', 'Nowhere')).data.scope, null, 'falls back to all markets');
    assert.equal((await new (await import('./helpers.js')).Client().get('/api/prices/outlook?crop=Tomato')).status, 401);
  });
});
