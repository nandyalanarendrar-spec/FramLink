import cron from 'node-cron';
import MarketPrice from '../models/MarketPrice.js';
import { agmarknetConfigured, importAgmarknet } from '../services/agmarknet.js';
import { checkAlerts } from '../services/alerts.js';
import { runReminders } from '../services/reminders.js';

// Result of the most recent import (kept in memory, shown on the admin Market prices page)
export const lastImport = { at: null, trigger: null, ok: null, fetched: 0, saved: 0, error: null };

let running = false;

export async function runPriceImport(trigger = 'manual') {
  if (running) return { fetched: 0, saved: 0, skipped: 'An import is already running' };
  running = true;
  try {
    const r = await importAgmarknet();
    await checkAlerts(); // fresh prices may have reached someone's target
    Object.assign(lastImport, { at: new Date(), trigger, ok: true, ...r, error: null });
    console.log(`[jobs] price import (${trigger}): fetched ${r.fetched}, saved ${r.saved}`);
    return r;
  } catch (err) {
    Object.assign(lastImport, { at: new Date(), trigger, ok: false, fetched: 0, saved: 0, error: err.message });
    console.error(`[jobs] price import (${trigger}) failed: ${err.message}`);
    throw err;
  } finally {
    running = false;
  }
}

export async function startJobs() {
  if (process.env.DISABLE_JOBS === 'true') return;

  // Farmer reminders (listing deadlines, harvest day, price moves) every morning, whether or not prices are imported
  cron.schedule('0 8 * * *', () => runReminders().catch(() => {}), { timezone: 'Asia/Kolkata' });
  console.log('[jobs] farmer reminders scheduled daily at 08:00 IST');

  if (!agmarknetConfigured()) {
    console.log('[jobs] DATA_GOV_API_KEY not set, so the daily mandi price import is off');
    return;
  }

  // Morning and evening: mandis report through the day, and repeat imports are harmless
  for (const expr of ['0 9 * * *', '0 18 * * *']) {
    cron.schedule(expr, () => runPriceImport('scheduled').catch(() => {}), { timezone: 'Asia/Kolkata' });
  }
  console.log('[jobs] mandi price import scheduled daily at 09:00 and 18:00 IST');

  // Catch up after downtime: nothing imported yet, or newest imported data is over 2 days old
  const newest = await MarketPrice.findOne({ source: 'agmarknet' }, 'date').sort({ date: -1 }).lean();
  if (!newest || Date.now() - newest.date > 2 * 864e5) runPriceImport('startup').catch(() => {});
}
