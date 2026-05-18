// 카탈로그 시드 — CATALOG_ITEMS(150) → catalog_items.
// 실행: bun run scripts/seed-catalog.ts
// 멱등 — code(unique) 기반 upsert. code = catalog.key, name = nameKo, slot.
// 등급/성능/스프라이트경로 컬럼 없음(GDD §3.1) — 스프라이트는 code로 매핑(sprite-manifest).

import { config } from 'dotenv';
import postgres from 'postgres';
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
