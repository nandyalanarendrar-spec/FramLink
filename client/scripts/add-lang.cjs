// Appends entries to a language dictionary. Usage: node scripts/add-lang.cjs hi entries.json   ({ "English": "translation", ... })
// Works for any src/i18n/<code>.ts whose entries are written as "English": "translation",
const fs = require('fs');
const [code, jsonPath] = process.argv.slice(2);
if (!code || !jsonPath) {
  console.error('Usage: node scripts/add-lang.cjs <code> entries.json');
  process.exit(1);
}
const entries = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
const file = `src/i18n/${code}.ts`;
let src = fs.readFileSync(file, 'utf8');
const q = (s) => JSON.stringify(s);
const lines = [];
for (const [k, v] of Object.entries(entries)) {
  if (!v || src.includes(`${q(k)}:`) || src.includes(`'${k}':`)) continue; // empty or already translated
  lines.push(`  ${q(k)}: ${q(v)},`);
}
const tail = `\n}\nexport default ${code}\n`;
if (!src.endsWith(tail)) throw new Error(`${file} does not end the way this script expects`);
src = src.slice(0, -tail.length) + `\n${lines.join('\n')}` + tail;
fs.writeFileSync(file, src);
console.log(`added ${lines.length} ${code} entries`);
