// review FINAL 108종 → catalog-next.ts (CATALOG_NEXT). {key,slot,nameKo,region,lore,art}
import { readFileSync, writeFileSync } from 'node:fs';
const html = readFileSync('sprites-test-review.html', 'utf8');
const ev = (n: string) => { const m = html.match(new RegExp(`const ${n} = (\\[[\\s\\S]*?\\n\\])\\s*;`)); return eval(m![1]); };
const ALL = [...ev('SETS'), ...ev('SETS2')];
const byRN: Record<string, any> = {}; const byN: Record<string, any> = {};
for (const s of ALL) for (const it of s.items) {
  const rec = { key: it.key, slot: it.slot, nameKo: it.name, lore: it.lore || '', art: it.prompt || '' };
  byRN[s.region + '|' + it.name] = rec; byN[it.name] = rec;
}
const fin = JSON.parse(readFileSync('/tmp/final108.json', 'utf8')) as [string, string[][]][];
const out: any[] = []; const miss: string[] = [];
for (const [region, sets] of fin) for (const names of sets) for (const nm of names) {
  const r = byRN[region + '|' + nm] || byN[nm];
  if (!r) { miss.push(region + '/' + nm); continue; }
  out.push({ key: r.key, slot: r.slot, nameKo: r.nameKo, region, lore: r.lore, art: r.art });
}
if (miss.length) { console.error('MISSING', miss); process.exit(1); }
const body = `// 최종 108종 카탈로그 — review FINAL(지역×6세트×무기/방어구/장신구). 단일 source.\nimport type { CatalogItem } from './catalog';\n\nexport const CATALOG_NEXT: CatalogItem[] = ${JSON.stringify(out, null, 2)};\n`;
writeFileSync('lib/game/equipment/catalog-next.ts', body);
const bySlot = out.reduce((a: any, c) => (a[c.slot] = (a[c.slot] || 0) + 1, a), {});
console.log('catalog-next.ts:', out.length, JSON.stringify(bySlot));
