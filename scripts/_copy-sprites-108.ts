// review FINAL 108 정적 → public/sprites/<slot>/<key>.png (128, contain). 아틀라스 소스.
// 또한 애니 보유 항목 목록(anim-obj) 수집 → /tmp/anim108.json
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
const html = readFileSync('sprites-test-review.html', 'utf8');
const ev = (n: string) => { const m = html.match(new RegExp(`const ${n} = (\\[[\\s\\S]*?\\n\\])\\s*;`)); return eval(m![1]); };
const ALL = [...ev('SETS'), ...ev('SETS2')];
const byRN: Record<string, any> = {}; const byN: Record<string, any> = {};
for (const s of ALL) for (const it of s.items) {
  const rec = { key: it.key, slot: it.slot, st: it.staticSrc, dir: it.objAnim ? it.objAnim.dir : null, n: it.objAnim ? it.objAnim.n : 0 };
  byRN[s.region + '|' + it.name] = rec; byN[it.name] = rec;
}
const fin = JSON.parse(readFileSync('/tmp/final108.json', 'utf8')) as [string, string[][]][];
const anim: { key: string; slot: string; dir: string; n: number }[] = [];
let copied = 0; const miss: string[] = [];
for (const [region, sets] of fin) for (const names of sets) for (const nm of names) {
  const r = byRN[region + '|' + nm] || byN[nm];
  if (!r) { miss.push(nm); continue; }
  const src = r.st.startsWith('public/') ? r.st : join('public', r.st);
  const outDir = join('public', 'sprites', r.slot); mkdirSync(outDir, { recursive: true });
  await sharp(src).resize(128, 128, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toFile(join(outDir, `${r.key}.png`));
  copied++;
  if (r.dir) anim.push({ key: r.key, slot: r.slot, dir: r.dir, n: r.n });
}
writeFileSync('/tmp/anim108.json', JSON.stringify(anim));
console.log(`copied ${copied}/108 statics, anim 보유 ${anim.length}, missing ${miss.length} ${miss.join(',')}`);
