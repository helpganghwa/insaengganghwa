// 해방 애니 데이터 — 108 코드별 프레임 → 가로 스트립 webp + manifest.
// 코드: scripts/_catalog-108.json, 애니 경로: sprites-test-review.html(objAnim).
// 출력: public/sprites/anim/<code>.webp (N×128) + public/sprites/anim.json
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';

const CELL = 128;
const cat = JSON.parse(readFileSync('scripts/_catalog-108.json', 'utf8')) as { code: string }[];
const html = readFileSync('sprites-test-review.html', 'utf8');
const ev = (n: string) => { const m = html.match(new RegExp(`const ${n} = (\\[[\\s\\S]*?\\n\\])\\s*;`)); return eval(m![1]); };
const ALL = [...ev('SETS'), ...ev('SETS2')];
const anim: Record<string, { dir: string; n: number }> = {};
for (const s of ALL) for (const it of s.items) if (it.objAnim) anim[it.key] = { dir: it.objAnim.dir, n: it.objAnim.n };

const outDir = join('public', 'sprites', 'anim'); mkdirSync(outDir, { recursive: true });
const manifest: Record<string, { frames: number }> = {};
let ok = 0; const miss: string[] = [];
for (const { code } of cat) {
  const a = anim[code];
  if (!a) { miss.push(code); continue; }
  const dir = a.dir.startsWith('public/') ? a.dir : join('public', a.dir);
  const tiles: sharp.OverlayOptions[] = [];
  for (let i = 0; i < a.n; i++) {
    const frame = await sharp(join(dir, `${i}.png`)).resize(CELL, CELL, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
    tiles.push({ input: frame, left: i * CELL, top: 0 });
  }
  const strip = await sharp({ create: { width: a.n * CELL, height: CELL, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite(tiles).webp({ lossless: true, effort: 6 }).toBuffer();
  writeFileSync(join(outDir, `${code}.webp`), strip);
  manifest[code] = { frames: a.n };
  ok++;
}
writeFileSync(join('public', 'sprites', 'anim.json'), JSON.stringify({ cell: CELL, items: manifest }));
console.log(`anim strips: ${ok}/${cat.length}, missing ${miss.length} ${miss.join(',')}`);
