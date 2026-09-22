import 'server-only';

import { revalidateTag } from 'next/cache';
import { sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { CHUSEOK_ITEM_KEYS } from '@/lib/game/equipment/catalog-v6';
import { buildProbabilityPayloadCore } from '@/lib/game/probability-payload';

import { CHUSEOK_START_MS } from './config';

/**
 * 한가위 6종 자동 개방(2026-09-22 사용자 결정: "자정 플래그로 자동 적용").
 *
 * seed-catalog가 active=false로 넣어 둔 6종을 시작 시각(CHUSEOK_START_ISO, 9/24 00:00 KST)이 지나면 켠다.
 * 켜는 순서 = 게임산업법 §33 절차(docs/CHUSEOK.md, memory): 공지는 24시간 전에 운영자가 냈고, 여기서
 *  ① catalog_items.active=true → ② 'catalog' 캐시 무효화(확률 공시·보급 풀이 같은 순간 바뀐다) →
 *  ③ probability_snapshots에 공시 전문 기록(활성 수 반영 뒤). 멱등 — 켤 것이 없으면 아무것도 안 한다.
 * 예약 발행 크론(5분 주기)이 매번 부르므로 실제 개방은 00:00~00:05 사이.
 */
export async function openChuseokCatalogIfDue(now = Date.now()): Promise<{ opened: number; snapshotId: string | null }> {
  if (now < CHUSEOK_START_MS) return { opened: 0, snapshotId: null };
  const codes = [...CHUSEOK_ITEM_KEYS];
  const rows = (await db.execute(sql`
    update catalog_items set active = true
     where active = false and code = any(array[${sql.join(codes.map((c) => sql`${c}`), sql`, `)}]::text[])
    returning code
  `)) as unknown as { code: string }[];
  if (rows.length === 0) return { opened: 0, snapshotId: null };
  revalidateTag('catalog', 'max');
  // 공시 스냅샷 — scripts/record-probability-snapshot.ts와 같은 단일 출처(buildProbabilityPayloadCore).
  const slotCounts = (await db.execute(sql`
    select slot, count(*)::int as n from catalog_items where active = true group by slot order by slot
  `)) as unknown as { slot: string; n: number }[];
  const payload = { ...buildProbabilityPayloadCore(slotCounts), note: `한가위 6종 개방(${rows.map((r) => r.code).join(', ')})` };
  const [snap] = (await db.execute(sql`
    insert into probability_snapshots (effective_at, payload) values (now(), ${JSON.stringify(payload)}::jsonb) returning id
  `)) as unknown as { id: string }[];
  console.log(`[chuseok-open] 개방 ${rows.length}종, 공시 스냅샷 id=${snap?.id ?? '?'}`);
  return { opened: rows.length, snapshotId: snap?.id ?? null };
}
