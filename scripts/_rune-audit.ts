import fs from 'fs';
const lines = fs.readFileSync('sprites-test-review.html', 'utf8').split('\n');
let region = '', tone = '', set = '';
type Item = { region: string; tone: string; set: string; slot: string; key: string; name: string; prompt: string; lore: string };
const items: Item[] = [];
let cur: Item | null = null;
for (const ln of lines) {
  const r = ln.match(/region: '([^']+)', tone: '([^']+)', setName: '([^']+)'/);
  if (r) { region = r[1]; tone = r[2]; set = r[3]; continue; }
  const k = ln.match(/\{ slot: '([^']+)', key: '([^']+)', name: '([^']+)'/);
  if (k) { cur = { region, tone, set, slot: k[1], key: k[2], name: k[3], prompt: '', lore: '' }; items.push(cur); continue; }
  const p = ln.match(/prompt: '(.*)',\s*$/);
  if (p && cur) { cur.prompt = p[1]; continue; }
  const l = ln.match(/lore: '(.*)' \},\s*$/);
  if (l && cur) { cur.lore = l[1]; continue; }
}
const hasP = (i: Item) => /rune|glyph/i.test(i.prompt);
const hasL = (i: Item) => /룬/.test(i.lore);
const either = (i: Item) => hasP(i) || hasL(i);
console.log('TOTAL items:', items.length);
console.log('PROMPT has rune/glyph:', items.filter(hasP).length, '(' + Math.round(100 * items.filter(hasP).length / items.length) + '%)');
console.log("LORE has '룬':", items.filter(hasL).length, '(' + Math.round(100 * items.filter(hasL).length / items.length) + '%)');
console.log('EITHER:', items.filter(either).length, '(' + Math.round(100 * items.filter(either).length / items.length) + '%)');
const byR: Record<string, { t: number; e: number }> = {};
for (const i of items) { (byR[i.region] = byR[i.region] || { t: 0, e: 0 }).t++; if (either(i)) byR[i.region].e++; }
console.log('\n--- by region (either / total) ---');
for (const r in byR) console.log(' ', r, byR[r].e + '/' + byR[r].t);
console.log('\n--- WITH rune (P=prompt image, L=lore word) ---');
for (const i of items.filter(either)) console.log(`  ${i.region}/${i.tone} ${i.key} P:${hasP(i) ? 'Y' : '-'} L:${hasL(i) ? 'Y' : '-'}`);
console.log('\n--- WITHOUT any rune ---');
for (const i of items.filter(x => !either(x))) console.log(`  ${i.region}/${i.tone} ${i.key}`);
