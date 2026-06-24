// 해방 애니 데이터 — 108 코드별 프레임 → 가로 스트립 webp + manifest.
// 코드: scripts/_catalog-108.json, 애니 경로: sprites-test-review.html(objAnim).
// 출력: public/sprites/anim/<code>.webp (N×128) + public/sprites/anim.json
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';

const CELL = 128;

// 일회성 에셋 빌드 — 입력은 스프라이트 작업 중에만 존재하는 트랜지언트 파일.
//   scripts/_catalog-108.json  : 108 카탈로그 코드 목록
//   sprites-test-review.html   : 애니 프레임 경로(objAnim) 정의
// 둘 중 하나라도 없으면 산출물(public/sprites/anim.json)은 이미 빌드된 것이니
// 입력을 복원하지 않는 한 재실행 불필요. 암호 같은 ENOENT 대신 명확히 안내.
for (const f of ['scripts/_catalog-108.json', 'sprites-test-review.html']) {
  if (!existsSync(f)) {
    console.error(`[build-anim-atlas] 입력 누락: ${f}\n  이 스크립트는 스프라이트 애니 작업 중에만 쓰는 일회성 빌드입니다.\n  산출물 public/sprites/anim.json 은 이미 커밋돼 있으니, 입력을 복원한 경우에만 재실행하세요.`);
    process.exit(1);
  }
}

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
