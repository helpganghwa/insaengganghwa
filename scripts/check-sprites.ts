// sprite 정합 체크 (read-only).
// 사용: bun run scripts/check-sprites.ts  (또는 `bun run verify:sprites`)
//
// 점검:
//   1) catalog.ts 키 ↔ public/sprites/<slot>/<key>.png 파일 1:1
//   2) catalog.ts 키 ↔ sprite-manifest 매핑 1:1
//   3) catalog.ts 키 ↔ atlas.json items 키 1:1
//
// 어긋남 발견 시 exit 1 — CI/pre-push hook에서 사용 가능.

import { existsSync } from 'node:fs';

import { CATALOG_ITEMS } from '../lib/game/equipment/catalog';
import { SPRITE_MANIFEST } from '../lib/game/equipment/sprite-manifest';
import atlas from '../public/sprites/atlas.json' with { type: 'json' };

const catalogKeys = new Set(CATALOG_ITEMS.map((c) => c.key));
const manifestKeys = new Set(Object.keys(SPRITE_MANIFEST));
const atlasKeys = new Set(Object.keys((atlas as { items: Record<string, unknown> }).items));

const issues: string[] = [];

// 파일 존재 + manifest 경로 일치
for (const c of CATALOG_ITEMS) {
  const path = `public/sprites/${c.slot}/${c.key}.png`;
  if (!existsSync(path)) issues.push(`sprite 파일 없음: ${path}`);
  const m = SPRITE_MANIFEST[c.key];
  const expected = `/sprites/${c.slot}/${c.key}.png`;
  if (m !== expected) issues.push(`manifest 불일치: ${c.key} | manifest="${m}" expected="${expected}"`);
}

// catalog ↔ manifest 집합 diff
for (const k of manifestKeys) if (!catalogKeys.has(k)) issues.push(`manifest 잉여 키: ${k} (catalog에 없음)`);
for (const k of catalogKeys) if (!manifestKeys.has(k)) issues.push(`manifest 누락 키: ${k}`);

// catalog ↔ atlas 집합 diff
for (const k of atlasKeys) if (!catalogKeys.has(k)) issues.push(`atlas 잉여 키: ${k} (catalog에 없음 — 재빌드 필요)`);
for (const k of catalogKeys) if (!atlasKeys.has(k)) issues.push(`atlas 누락 키: ${k} (재빌드 필요)`);

console.log(`[catalog ${catalogKeys.size}] [manifest ${manifestKeys.size}] [atlas ${atlasKeys.size}]`);

if (issues.length === 0) {
  console.log('✓ sprite 정합 OK');
  process.exit(0);
}

console.error(`✗ ${issues.length}건 불일치:`);
for (const i of issues) console.error(`  · ${i}`);
console.error(
  '\n복구: `bun run build:atlas && bun run build:asset-versions` ' +
    '(필요 시 manifest 재생성)',
);
process.exit(1);
