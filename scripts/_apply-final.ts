import { readFileSync, writeFileSync } from 'fs';

const old = JSON.parse(readFileSync('scripts/_story-old.json', 'utf8')) as Record<string, string>;
const fin = JSON.parse(readFileSync('scripts/_story-final.json', 'utf8')) as {
  improved: Record<string, string>;
  revertClean: Record<string, string>;
  revert: string[];
};

// 최종 lore 맵 구성: improved > revertClean > old(되돌림)
const finalMap: Record<string, string> = {};
for (const k of fin.revert) finalMap[k] = fin.revertClean[k] ?? old[k];
for (const k of Object.keys(fin.improved)) finalMap[k] = fin.improved[k];

let html = readFileSync('sprites-test-review.html', 'utf8');
let applied = 0;
const missing: string[] = [];
for (const [key, lore] of Object.entries(finalMap)) {
  const esc = lore.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  const re = new RegExp(`(key: '${key}'[\\s\\S]*?lore: ')(?:[^'\\\\]|\\\\.)*(')`);
  if (!re.test(html)) { missing.push(key); continue; }
  html = html.replace(re, `$1${esc}$2`);
  applied++;
}
writeFileSync('sprites-test-review.html', html);
console.log(`applied ${applied} / total ${Object.keys(finalMap).length} / missing ${missing.length}`);
if (missing.length) console.log('MISSING:', missing.join(', '));
