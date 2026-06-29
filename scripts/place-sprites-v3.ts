// 3차 60종 정적 스프라이트 배치: public/sprites/pool/<id>.png → public/sprites/<slot>/<code>.png
// SPRITE_MANIFEST 규약(/sprites/{slot}/{code}.png)에 맞춤. 컷오버 전 미리 배치(미참조라 무해).
// 입력: scripts/catalog-v3-codemap.json (id → {code, slot})
import { readFileSync, copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const map = JSON.parse(readFileSync(join(ROOT, 'scripts/catalog-v3-codemap.json'), 'utf8')) as Record<string, { code: string; slot: string }>;

let ok = 0;
const miss: string[] = [];
for (const id of Object.keys(map)) {
  const { code, slot } = map[id];
  const src = join(ROOT, 'public/sprites/pool', `${id}.png`);
  const dstDir = join(ROOT, 'public/sprites', slot);
  const dst = join(dstDir, `${code}.png`);
  if (!existsSync(src)) { miss.push(id); continue; }
  mkdirSync(dstDir, { recursive: true });
  copyFileSync(src, dst);
  ok++;
}
console.log(`배치 ${ok}/${Object.keys(map).length}` + (miss.length ? ` · 소스누락: ${miss.join(', ')}` : ''));
