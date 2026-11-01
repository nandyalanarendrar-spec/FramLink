// Approximate centre of each Andhra Pradesh district (lat, lng). Used for distance estimates only.
export const AP_DISTRICTS = {
  Anantapur: [14.68, 77.6],
  'Sri Sathya Sai': [14.17, 77.81],
  Kurnool: [15.83, 78.04],
  Nandyal: [15.48, 78.48],
  Kadapa: [14.47, 78.82],
  Annamayya: [14.05, 78.75],
  Chittoor: [13.22, 79.1],
  Tirupati: [13.63, 79.42],
  Nellore: [14.44, 79.99],
  Prakasam: [15.5, 80.05],
  Markapuram: [15.73, 79.27],
  Bapatla: [15.9, 80.47],
  Guntur: [16.31, 80.44],
  Palnadu: [16.24, 80.05],
  'NTR (Vijayawada)': [16.51, 80.65],
  Krishna: [16.18, 81.13],
  Eluru: [16.71, 81.1],
  'West Godavari': [16.54, 81.52],
  'East Godavari': [17.0, 81.8],
  Kakinada: [16.99, 82.25],
  Konaseema: [16.58, 82.0],
  'Alluri Sitharama Raju': [18.08, 82.67],
  Anakapalli: [17.69, 83.0],
  Visakhapatnam: [17.69, 83.22],
  Vizianagaram: [18.11, 83.4],
  'Parvathipuram Manyam': [18.78, 83.43],
  Srikakulam: [18.3, 83.9],
};

const key = (s) => String(s ?? '').toLowerCase().replace(/[.()]/g, ' ').replace(/\bdistrict\b/g, '').replace(/\s+/g, ' ').trim();

// Spellings and old names people (and AGMARKNET) use for the districts above
const ALIASES = {
  ananthapuramu: 'Anantapur', ananthapur: 'Anantapur', puttaparthi: 'Sri Sathya Sai', 'sri sathyasai': 'Sri Sathya Sai',
  'ysr kadapa': 'Kadapa', 'y s r kadapa': 'Kadapa', ysr: 'Kadapa', cuddapah: 'Kadapa', rayachoti: 'Annamayya',
  tirupathi: 'Tirupati', 'sri potti sriramulu nellore': 'Nellore', 'spsr nellore': 'Nellore', ongole: 'Prakasam',
  narasaraopet: 'Palnadu', vijayawada: 'NTR (Vijayawada)', ntr: 'NTR (Vijayawada)', machilipatnam: 'Krishna',
  bhimavaram: 'West Godavari', rajahmundry: 'East Godavari', 'dr b r ambedkar konaseema': 'Konaseema', amalapuram: 'Konaseema',
  chittor: 'Chittoor', anakapally: 'Anakapalli', asr: 'Alluri Sitharama Raju', paderu: 'Alluri Sitharama Raju', anakapalle: 'Anakapalli', vizag: 'Visakhapatnam', visakhapatnam: 'Visakhapatnam',
};

const CANON = Object.fromEntries(Object.keys(AP_DISTRICTS).map((d) => [key(d), d]));

/** Canonical AP district name for any spelling, or null if we do not recognise it */
export function normalizeDistrict(name) {
  const k = key(name);
  return CANON[k] ?? ALIASES[k] ?? null;
}

/** Rough road distance in km between two districts (straight line x 1.3), or null if either is unknown */
export function roadDistanceKm(fromName, toName) {
  const a = AP_DISTRICTS[normalizeDistrict(fromName)];
  const b = AP_DISTRICTS[normalizeDistrict(toName)];
  if (!a || !b) return null;
  const rad = (x) => (x * Math.PI) / 180;
  const dLat = rad(b[0] - a[0]);
  const dLng = rad(b[1] - a[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLng / 2) ** 2;
  const straight = 2 * 6371 * Math.asin(Math.sqrt(h));
  return Math.round(straight * 1.3);
}
