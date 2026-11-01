// Appends Telugu entries to src/i18n/te.ts. Usage: node scripts/add-te.cjs entries.json  ({ "English": "తెలుగు", ... })
const fs = require('fs');
const entries = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const file = 'src/i18n/te.ts';
let src = fs.readFileSync(file, 'utf8');
const q = (s) => (s.includes("'") ? JSON.stringify(s) : `'${s.replace(/\\/g, '\\\\')}'`);
let added = 0;
const lines = [];
for (const [k, v] of Object.entries(entries)) {
  if (src.includes(`${q(k)}:`)) continue; // already translated
  lines.push(`  ${q(k)}: ${q(v)},`);
  added++;
}
src = src.replace(/\n}\nexport default te\n$/, `\n${lines.join('\n')}\n}\nexport default te\n`);
fs.writeFileSync(file, src);
console.log(`added ${added} Telugu entries`);
