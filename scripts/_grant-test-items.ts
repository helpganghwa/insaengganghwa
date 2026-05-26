/**
 * 강화 FX 테스트용 임시 아이템 지급(2026-05-26).
 * 1회용 — 실행 후 삭제 가능. 다양한 슬롯·레벨 조합으로 success/mega/hold/down/cycle 분기 전부 커버.
 *
 * 실행: bun run scripts/_grant-test-items.ts
 */
import { config } from 'dotenv';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { eq } from 'drizzle-orm';

import * as schema from '../lib/db/schema';
const { catalogItems, equipmentInstances, userCodex } = schema;

config({ path: '.env.local' });
config({ path: '.env', override: false });

const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL 또는 DIRECT_URL 필요 — .env.local 확인');
  process.exit(1);
}
const client = postgres(url, { prepare: false, max: 1 });
const db = drizzle(client, { schema });

const TEST_USER = 'e30b881b-0ad6-45cc-b468-a0b4073fbf3f';

// 강화 50~250 / 초월 0~15 다양 분포 — FX 4-tier + 사이클 0/1/2 전부 체감.
// +100 이상은 fodder 필요(같은 catalog 다른 인스턴스) — 자동 동반.
type Plan = { slot: 'weapon' | 'armor' | 'accessory'; enhanceLevel: number; transcendLevel: number; note: string };
const PLAN: Plan[] = [
  { slot: 'weapon', enhanceLevel: 50, transcendLevel: 0, note: 'cycle 0 중반 · success 일반' },
  { slot: 'armor', enhanceLevel: 75, transcendLevel: 2, note: 'cycle 0 말미 · hold/down · 초월 2' },
  { slot: 'accessory', enhanceLevel: 98, transcendLevel: 5, note: 'Boast +99 직전 · mega 최고 후보' },
  { slot: 'weapon', enhanceLevel: 125, transcendLevel: 1, note: 'cycle 1 초반 · fodder 동반' },
  { slot: 'armor', enhanceLevel: 175, transcendLevel: 3, note: 'cycle 1 말미 · down ↑ · fodder 동반' },
  { slot: 'accessory', enhanceLevel: 199, transcendLevel: 8, note: 'cycle 2 직전 · fodder 동반' },
  { slot: 'weapon', enhanceLevel: 210, transcendLevel: 11, note: 'cycle 2 초반 · 고초월 · fodder 동반' },
  { slot: 'armor', enhanceLevel: 245, transcendLevel: 15, note: 'cycle 2 말미 · 최고 초월 T15 · fodder 동반' },
];

const active = await db.select().from(catalogItems).where(eq(catalogItems.active, true));
const bySlot: Record<string, typeof active> = { weapon: [], armor: [], accessory: [] };
for (const r of active) bySlot[r.slot]!.push(r);

console.log(`활성 카탈로그: weapon ${bySlot.weapon!.length}종 / armor ${bySlot.armor!.length}종 / accessory ${bySlot.accessory!.length}종`);
for (const slot of ['weapon', 'armor', 'accessory'] as const) {
  if (bySlot[slot]!.length === 0) {
    console.error(`!! 슬롯 ${slot} 활성 카탈로그 0종 — 지급 불가`);
    process.exit(1);
  }
}

// 슬롯별 라운드 로빈으로 카탈로그 선정 (다양성 확보).
const cursor: Record<string, number> = { weapon: 0, armor: 0, accessory: 0 };
function pickCatalog(slot: 'weapon' | 'armor' | 'accessory') {
  const list = bySlot[slot]!;
  const item = list[cursor[slot]! % list.length]!;
  cursor[slot]!++;
  return item;
}

const FODDER_THRESHOLD = 100; // BALANCE FODDER_REQUIRED_FROM_LEVEL = CYCLE_LEN(100)
const fodderCount = PLAN.filter((p) => p.enhanceLevel >= FODDER_THRESHOLD).length;
console.log(`\n지급 계획 (메인 ${PLAN.length}개 + fodder ${fodderCount}개 = 총 ${PLAN.length + fodderCount}개) → ${TEST_USER}`);
for (const p of PLAN) {
  const c = bySlot[p.slot]![cursor[p.slot]! % bySlot[p.slot]!.length]!;
  const fod = p.enhanceLevel >= FODDER_THRESHOLD ? ' + 동일 catalog fodder(+0)' : '';
  console.log(`  ${p.slot.padEnd(9)} +${String(p.enhanceLevel).padStart(3)} T${String(p.transcendLevel).padStart(2)}  ← ${c.code} (${c.name})${fod} — ${p.note}`);
  cursor[p.slot]!++;
}

if (process.env.DRY_RUN === '1') {
  console.log('\n[DRY_RUN] 실제 insert 안 함. DRY_RUN 빼고 다시 실행하면 적용.');
  process.exit(0);
}

// cursor 초기화 후 실제 insert.
cursor.weapon = 0;
cursor.armor = 0;
cursor.accessory = 0;

const inserted: { id: bigint; slot: string; level: number; kind: 'main' | 'fodder' }[] = [];
for (const p of PLAN) {
  const c = pickCatalog(p.slot);
  const [row] = await db
    .insert(equipmentInstances)
    .values({
      userId: TEST_USER,
      catalogItemId: c.id,
      enhanceLevel: p.enhanceLevel,
      transcendLevel: p.transcendLevel,
    })
    .returning({ id: equipmentInstances.id });
  inserted.push({ id: row!.id, slot: p.slot, level: p.enhanceLevel, kind: 'main' });

  // +100 이상은 fodder 1개 동반 (같은 catalog, +0, T0, 미장착).
  if (p.enhanceLevel >= 100) {
    const [fod] = await db
      .insert(equipmentInstances)
      .values({
        userId: TEST_USER,
        catalogItemId: c.id,
        enhanceLevel: 0,
        transcendLevel: 0,
      })
      .returning({ id: equipmentInstances.id });
    inserted.push({ id: fod!.id, slot: p.slot, level: 0, kind: 'fodder' });
  }

  // 도감(user_codex) 갱신 — max_enhance_level 동기화.
  await db
    .insert(userCodex)
    .values({
      userId: TEST_USER,
      catalogItemId: c.id,
      maxEnhanceLevel: p.enhanceLevel,
    })
    .onConflictDoUpdate({
      target: [userCodex.userId, userCodex.catalogItemId],
      set: {
        maxEnhanceLevel: p.enhanceLevel, // 단순 덮어쓰기 (테스트용)
      },
    });
}

console.log(`\n✅ ${inserted.length}개 지급 완료`);
for (const i of inserted) console.log(`  instance#${i.id} ${i.slot} +${i.level}`);

await client.end();
process.exit(0);
