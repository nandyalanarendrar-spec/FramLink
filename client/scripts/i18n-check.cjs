// For every language dictionary in src/i18n (te.ts, hi.ts, ...), lists the t('...') / T('...') English strings that have no entry.
// Run: npm run i18n:check   (exits with an error if any language is missing strings)
const fs = require('fs');
const path = require('path');
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));

const used = new Map();
const re = /\b[tT]\(\s*(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"|`((?:[^`\\])*)`)/g;
for (const f of walk('src').filter((f) => /\.(tsx?|ts)$/.test(f) && !f.includes('i18n'))) {
  const s = fs.readFileSync(f, 'utf8');
  for (const m of s.matchAll(re)) {
    const k = (m[1] ?? m[2] ?? m[3]).replace(/\\'/g, "'").replace(/\\"/g, '"');
    if (!used.has(k)) used.set(k, f);
  }
}

const langs = fs.readdirSync('src/i18n').filter((f) => /^[a-z]{2}\.ts$/.test(f)).map((f) => f.slice(0, 2));
let failed = false;
for (const lang of langs) {
  const src = fs.readFileSync(`src/i18n/${lang}.ts`, 'utf8');
  const have = new Set();
  for (const m of src.matchAll(/^\s*(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"|`((?:[^`\\])*)`)\s*:/gm)) have.add((m[1] ?? m[2] ?? m[3]).replace(/\\'/g, "'").replace(/\\"/g, '"'));
  for (const m of src.matchAll(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*:\s*['"`]/gm)) have.add(m[1]);
  const missing = [...used].filter(([k]) => !have.has(k));
  const unused = [...have].filter((k) => !used.has(k));
  console.log(`[${lang}] strings used: ${used.size} | entries: ${have.size} | missing: ${missing.length} | unused entries: ${unused.length}`);
  missing.forEach(([k, f]) => console.log(`MISSING(${lang})`, path.basename(f), '::', k));
  if (process.argv.includes('--unused')) unused.forEach((k) => console.log(`UNUSED(${lang})`, k));
  if (missing.length) failed = true;
}
process.exit(failed ? 1 : 0);
