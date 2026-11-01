import MarketPrice from '../models/MarketPrice.js';
import PriceAlert from '../models/PriceAlert.js';
import { notify } from './notify.js';

const DAY = 864e5;
const FRESH_DAYS = 3; // only recent prices can fire an alert
const COOLDOWN_MS = DAY; // an alert speaks at most once a day

/**
 * Compare every alert with the freshest prices and notify the people whose target was reached.
 * Called after each price import / admin entry. Never throws.
 */
export async function checkAlerts() {
  try {
    const alerts = await PriceAlert.find({}).lean();
    if (!alerts.length) return 0;

    const since = new Date(Date.now() - FRESH_DAYS * DAY);
    const keys = [...new Set(alerts.map((a) => a.cropKey))];
    const rows = await MarketPrice.aggregate([
      { $match: { cropKey: { $in: keys }, date: { $gte: since } } },
      { $sort: { date: -1 } },
      { $group: { _id: { cropKey: '$cropKey', market: '$market' }, modalPrice: { $first: '$modalPrice' }, crop: { $first: '$crop' } } },
    ]);
    const byCrop = new Map();
    for (const r of rows) {
      const list = byCrop.get(r._id.cropKey) ?? [];
      list.push({ market: r._id.market, price: r.modalPrice });
      byCrop.set(r._id.cropKey, list);
    }

    let fired = 0;
    for (const a of alerts) {
      if (a.lastTriggeredAt && Date.now() - a.lastTriggeredAt < COOLDOWN_MS) continue;
      const markets = byCrop.get(a.cropKey);
      if (!markets?.length) continue;

      // "above": the best market price; "below": the lowest one
      const hit = markets.reduce((best, m) => (a.direction === 'above' ? (m.price > best.price ? m : best) : m.price < best.price ? m : best));
      const reached = a.direction === 'above' ? hit.price >= a.targetPrice : hit.price <= a.targetPrice;
      if (!reached) continue;

      await PriceAlert.updateOne({ _id: a._id }, { lastTriggeredAt: new Date() });
      await notify(a.user, {
        type: 'alert',
        title: 'Price alert',
        message: `${a.crop} is ₹${hit.price}/kg at ${hit.market}, ${a.direction === 'above' ? 'at or above' : 'at or below'} your target of ₹${a.targetPrice}/kg`,
        link: '/farmer/prices',
      });
      fired++;
    }
    return fired;
  } catch (err) {
    console.error('[alerts] check failed:', err.message);
    return 0;
  }
}
