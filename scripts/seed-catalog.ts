// 카탈로그 시드 — CATALOG_ITEMS → catalog_items.
// 실행: bun run scripts/seed-catalog.ts
// 멱등 — code(unique) 기반 upsert. code = catalog.key, name = nameKo, slot.
// 등급/성능/스프라이트경로 컬럼 없음(GDD §3.1) — 스프라이트는 code로 매핑(sprite-manifest).

import { config } from 'dotenv';
import postgres from 'postgres';
import { and, eq, notInArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';

import * as schema from '../lib/db/schema';
import { CATALOG_ITEMS } from '../lib/game/equipment/catalog';

config({ path: '.env.local' });
config({ path: '.env', override: false });

const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL 또는 DIRECT_URL 필요 — .env.local 확인');
  process.exit(1);
}

const client = postgres(url, { prepare: false, max: 1 });
const db = drizzle(client, { schema });

async function main() {
  console.log(`[catalog] upsert ${CATALOG_ITEMS.length}개`);
  let n = 0;
  for (const c of CATALOG_ITEMS) {
    await db
      .insert(schema.catalogItems)
      .values({ code: c.key, name: c.nameKo, slot: c.slot, active: true })
      .onConflictDoUpdate({
        target: schema.catalogItems.code,
        // 로어/이름이 바뀌어도 code는 불변 — name·slot만 동기화. active는 운영이 관리하므로 건드리지 않음.
        set: { name: c.nameKo, slot: c.slot },
      });
    n++;
  }
  // 편성에서 빠진 코드는 지우지 않고 비활성화한다 — 이미 보유한 유저의 장비가 메타 조인을
  // 잃지 않으면서 보급 드랍에서만 제외된다(lib/game/catalog.ts는 active=true만 뽑는다).
  const codes = CATALOG_ITEMS.map((c) => c.key);
  const retired = await db
    .update(schema.catalogItems)
    .set({ active: false })
    .where(and(eq(schema.catalogItems.active, true), notInArray(schema.catalogItems.code, codes)))
    .returning({ code: schema.catalogItems.code });
  if (retired.length) console.log(`[catalog] 비활성 전환 ${retired.length}개:`, retired.map((r) => r.code).join(', '));

  const bySlot = CATALOG_ITEMS.reduce<Record<string, number>>((a, c) => {
    a[c.slot] = (a[c.slot] ?? 0) + 1;
    return a;
  }, {});
  console.log(`[catalog] 완료 ${n}개`, bySlot);
  await client.end();
}

main().catch(async (e) => {
  console.error(e);
  await client.end();
  process.exit(1);
});
