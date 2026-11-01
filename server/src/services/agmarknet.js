import MarketPrice from '../models/MarketPrice.js';
import { normalizeDistrict } from '../utils/geo.js';
import { AppError } from '../utils/AppError.js';

// "Current Daily Price of Various Commodities from Various Markets (Mandi)" on data.gov.in.
// Prices there are rupees per quintal (100 kg); we store rupees per kg.
const RESOURCE_ID = '9ef84268-d588-465a-a308-a864a43d0070';
const PAGE = 500;
const MAX_PAGES = 4;

const num = (v) => {
  const n = Number(String(v ?? '').replace(/,/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
};

// "31/10/2026" -> Date (UTC midnight)
function parseDate(s) {
  const m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(String(s ?? '').trim());
  if (!m) return null;
  const d = new Date(Date.UTC(+m[3], +m[2] - 1, +m[1]));
  return Number.isNaN(+d) ? null : d;
}

/** Turn one API record into a MarketPrice document, or null if the record is unusable */
export function mapRecord(r) {
  const crop = String(r.commodity ?? '').trim();
  const market = String(r.market ?? '').trim();
  const date = parseDate(r.arrival_date);
  const min = num(r.min_price);
  const max = num(r.max_price);
  const modal = num(r.modal_price);
  if (!crop || !market || !date || !modal) return null;

  const district = normalizeDistrict(r.district) ?? String(r.district ?? '').trim();
  const per = (q) => Math.round((q / 100) * 100) / 100; // quintal -> kg
  const lo = per(min ?? modal);
  const hi = per(max ?? modal);
  return {
    crop,
    cropKey: crop.toLowerCase(),
    variety: r.variety ? String(r.variety).trim() : undefined,
    market,
    district: district || 'Unknown',
    state: String(r.state ?? 'Andhra Pradesh').trim(),
    minPrice: Math.min(lo, per(modal)),
    maxPrice: Math.max(hi, per(modal)),
    modalPrice: per(modal),
    date,
    source: 'agmarknet',
  };
}

export const agmarknetConfigured = () => Boolean(process.env.DATA_GOV_API_KEY);

/** Pull the latest Andhra Pradesh mandi prices and upsert them. `fetchImpl` is injectable for tests. */
export async function importAgmarknet({ fetchImpl = fetch } = {}) {
  const apiKey = process.env.DATA_GOV_API_KEY;
  if (!apiKey) throw new AppError('Set DATA_GOV_API_KEY in server/.env (free key from data.gov.in) to import mandi prices', 400);

  let seen = 0;
  const ops = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const url = new URL(`https://api.data.gov.in/resource/${RESOURCE_ID}`);
    url.search = new URLSearchParams({ 'api-key': apiKey, format: 'json', limit: String(PAGE), offset: String(page * PAGE), 'filters[state.keyword]': 'Andhra Pradesh' }).toString();

    let body;
    try {
      const res = await fetchImpl(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      body = await res.json();
    } catch (err) {
      if (page === 0) throw new AppError(`Could not reach data.gov.in (${err.message}). Check the API key and your internet.`, 502);
      break;
    }

    const records = body.records ?? [];
    seen += records.length;
    for (const rec of records) {
      const doc = mapRecord(rec);
      if (doc) ops.push({ updateOne: { filter: { cropKey: doc.cropKey, market: doc.market, date: doc.date, source: 'agmarknet' }, update: { $set: doc }, upsert: true } });
    }
    if (records.length < PAGE) break;
  }

  if (ops.length) await MarketPrice.bulkWrite(ops, { ordered: false });
  return { fetched: seen, saved: ops.length };
}
