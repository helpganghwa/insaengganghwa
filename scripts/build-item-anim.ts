// 장비 애니(게임용) 재배선 — anim3/<id>.webp(pool-ID 키) → sprites/itemanim/<code>.webp(code 키)
// + sprites/itemanim.json(code → {frames}, cell). 게임 렌더러(TranscendSprite)가 code로 조회.
// (검수용 anim3/<id>.webp + anim3.json은 그대로 둠 — 리뷰 툴 호환.)
// 입력: scripts/catalog-v3-codemap.json, public/sprites/anim3/<id>.webp, public/sprites/anim3.json
import { readFileSync, writeFileSync, copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const map = JSON.parse(readFileSync(join(ROOT, 'scripts/catalog-v3-codemap.json'), 'utf8')) as Record<string, { code: string; slot: string }>;
const anim3 = JSON.parse(readFileSync(join(ROOT, 'public/sprites/anim3.json'), 'utf8')) as { cell: number; items: Record<string, { frames: number }> };

const outDir = join(ROOT, 'public/sprites/itemanim');
mkdirSync(outDir, { recursive: true });

// 기존 json의 비-anim3 항목(2차 편입분 cell 오버라이드 포함) 보존 — 재실행 시 유실 방지.
const prevPath = join(ROOT, 'public/sprites/itemanim.json');
const prev = existsSync(prevPath)
  ? (JSON.parse(readFileSync(prevPath, 'utf8')) as { items: Record<string, { frames: number; cell?: number }> }).items
  : {};
const anim3Codes = new Set(Object.values(map).map((m) => m.code));
const items: Record<string, { frames: number; cell?: number }> = Object.fromEntries(
  Object.entries(prev).filter(([code]) => !anim3Codes.has(code)),
);
let ok = 0;
const miss: string[] = [];
for (const id of Object.keys(map)) {
  const { code } = map[id];
  const src = join(ROOT, 'public/sprites/anim3', `${id}.webp`);
  const meta = anim3.items[id];
  if (!existsSync(src) || !meta) { miss.push(id); continue; }
  copyFileSync(src, join(outDir, `${code}.webp`));
  items[code] = { frames: meta.frames };
  ok++;
}
writeFileSync(join(ROOT, 'public/sprites/itemanim.json'), JSON.stringify({ cell: anim3.cell, items }));
console.log(`itemanim 재배선 ${ok}/${Object.keys(map).length}` + (miss.length ? ` · 누락: ${miss.join(', ')}` : ''));
console.log(`cell ${anim3.cell} · ${Object.keys(items).length}종 → public/sprites/itemanim.json`);
