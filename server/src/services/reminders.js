import CropListing from '../models/CropListing.js';
import MarketPrice from '../models/MarketPrice.js';
import ReminderLog from '../models/ReminderLog.js';
import { notify, inr, kg } from './notify.js';

const DAY = 864e5;
const PRICE_MOVE = 0.1; // 10% or more over the last week is worth a message
const utcDay = (d) => Math.floor(new Date(d).getTime() / DAY); // whole days since 1970, in UTC
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// True only the first time this (user, key) pair is seen, so every reminder is sent once
async function firstTime(user, key) {
  try {
    await ReminderLog.create({ user, key });
    return true;
  } catch (err) {
    if (err.code === 11000) return false;
    throw err;
  }
}

const when = (n) => (n <= 0 ? 'today' : n === 1 ? 'tomorrow' : `in ${n} days`);

// "Your Tomato listing ends in 2 days": only for listings that still have stock
async function deadlineReminders(now) {
  const listings = await CropListing.find({
    status: { $in: ['active', 'partially_sold'] },
    availableQty: { $gt: 0 },
    deadline: { $gte: new Date(utcDay(now) * DAY), $lt: new Date((utcDay(now) + 3) * DAY) },
  }).lean();
  let sent = 0;
  for (const l of listings) {
    const left = utcDay(l.deadline) - utcDay(now);
    if (!(await firstTime(l.farmer, `deadline:${l._id}:${left}`))) continue;
    await notify(l.farmer, {
      type: 'reminder',
      title: left <= 0 ? `${l.crop} listing ends today` : `${l.crop} listing ends ${when(left)}`,
      message: `${kg(l.availableQty)} of ${l.crop} is still unsold. See buyers, markets and price tips to sell the rest in time.`,
      link: `/farmer/crops/${l._id}/leftover`,
    });
    sent++;
  }
  return sent;
}

// "Your harvest is tomorrow": a draft that is not published yet is invisible to buyers
async function harvestReminders(now) {
  const drafts = await CropListing.find({
    status: 'draft',
    harvestDate: { $gte: new Date(utcDay(now) * DAY), $lt: new Date((utcDay(now) + 2) * DAY) },
  }).lean();
  let sent = 0;
  for (const l of drafts) {
    const left = utcDay(l.harvestDate) - utcDay(now);
    if (!(await firstTime(l.farmer, `harvest:${l._id}:${left}`))) continue;
    await notify(l.farmer, {
      type: 'reminder',
      title: `${l.crop} harvest ${when(left)}`,
      message: `Your ${l.crop} listing is still a draft. Publish it so buyers can find it.`,
      link: `/farmer/crops/${l._id}/edit`,
    });
    sent++;
  }
  return sent;
}

// Average modal price of one crop over [from, to), using the farmer's district markets when there are any
async function windowAverage(cropKey, district, from, to) {
  const base = { cropKey, date: { $gte: from, $lt: to } };
  for (const extra of district ? [{ district: { $regex: `^${escapeRegex(district)}$`, $options: 'i' } }, {}] : [{}]) {
    const [r] = await MarketPrice.aggregate([{ $match: { ...base, ...extra } }, { $group: { _id: null, avg: { $avg: '$modalPrice' } } }]);
    if (r) return { avg: r.avg, local: Object.keys(extra).length > 0 };
  }
  return null;
}

// "Tomato price in Anantapur is up 15% this week": for every crop a farmer has live
async function priceMoves(now) {
  const live = await CropListing.find({ status: { $in: ['active', 'partially_sold'] } }, 'farmer crop district').lean();
  const seen = new Map();
  for (const l of live) seen.set(`${l.farmer}|${l.crop.toLowerCase()}|${l.district}`, l);

  const t = now.getTime();
  const bucket = Math.floor(t / (3 * DAY)); // a crop speaks at most once every 3 days
  let sent = 0;
  for (const l of seen.values()) {
    const cropKey = l.crop.toLowerCase();
    const [recent, before] = [
      await windowAverage(cropKey, l.district, new Date(t - 3 * DAY), new Date(t + DAY)),
      await windowAverage(cropKey, l.district, new Date(t - 10 * DAY), new Date(t - 3 * DAY)),
    ];
    if (!recent || !before || before.avg <= 0) continue;
    const change = (recent.avg - before.avg) / before.avg;
    if (Math.abs(change) < PRICE_MOVE) continue;

    const up = change > 0;
    if (!(await firstTime(l.farmer, `price:${cropKey}:${up ? 'up' : 'down'}:${bucket}`))) continue;
    const where = recent.local ? ` in ${l.district}` : '';
    const nums = `₹${Math.round(before.avg * 10) / 10} → ${inr(Math.round(recent.avg * 10) / 10)}/kg`;
    await notify(l.farmer, {
      type: 'reminder',
      title: `${l.crop} price ${up ? 'up' : 'down'} ${Math.round(Math.abs(change) * 100)}%`,
      message: up
        ? `${l.crop} prices${where} are up ${Math.round(change * 100)}% this week (${nums}). A good time to sell.`
        : `${l.crop} prices${where} are down ${Math.round(-change * 100)}% this week (${nums}). Sell soon, or wait if your deadline allows.`,
      link: '/farmer/prices',
    });
    sent++;
  }
  return sent;
}

/** Daily farmer reminders. Safe to run twice: every message is sent once. Never throws. */
export async function runReminders(now = new Date()) {
  const result = { deadline: 0, harvest: 0, price: 0 };
  for (const [name, fn] of [['deadline', deadlineReminders], ['harvest', harvestReminders], ['price', priceMoves]]) {
    try {
      result[name] = await fn(now);
    } catch (err) {
      console.error(`[reminders] ${name} failed:`, err.message);
    }
  }
  return result;
}
