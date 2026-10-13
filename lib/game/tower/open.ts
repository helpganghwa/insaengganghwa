import 'server-only';

import { sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { TOWER_FLOORS, TOWER_SECTION, TOWER_SECTION_11_OPEN_ISO, TOWER_SECTION_11_OPEN_MS } from '@/lib/game/balance';
import { buildProbabilityPayloadCore } from '@/lib/game/probability-payload';

const NOTE = `무한의 탑 11구간 개방(${TOWER_FLOORS - TOWER_SECTION + 1}~${TOWER_FLOORS}층 토벌 보상 추가)`;

/**
 * 무한의 탑 11구간(101~110층) 개방 뒷정리 — 추석 6종(lib/game/chuseok/open.ts)과 같은 구조.
 * 개방 자체는 서버 시각 게이트(towerOpenFloors)라 정각에 저절로 열리고, 여기서는 게임산업법 §33 기록으로
 * 확률 공시 스냅샷(effective_at = 개방 정각) 한 건만 남긴다. 예약 발행 크론(5분 주기)이 매번 부르므로 멱등 —
 * 같은 정각·같은 사유의 스냅샷이 이미 있으면 아무것도 안 한다.
 */
export async function recordTowerSection11SnapshotIfDue(now = Date.now()): Promise<{ snapshotId: string | null }> {
  if (now < TOWER_SECTION_11_OPEN_MS) return { snapshotId: null };
  const out = await db.transaction(async (tx) => {
    const [dup] = (await tx.execute(sql`
      select id from probability_snapshots
       where effective_at = ${TOWER_SECTION_11_OPEN_ISO}::timestamptz and payload->>'note' = ${NOTE}
       limit 1
    `)) as unknown as { id: string }[];
    if (dup) return null;
    // scripts/record-probability-snapshot.ts와 같은 단일 출처(buildProbabilityPayloadCore) — 개방 정각 기준 전문(110층).
    const slotCounts = (await tx.execute(sql`
      select slot, count(*)::int as n from catalog_items where active = true group by slot order by slot
    `)) as unknown as { slot: string; n: number }[];
    const payload = { ...buildProbabilityPayloadCore(slotCounts, TOWER_SECTION_11_OPEN_MS), note: NOTE };
    const [snap] = (await tx.execute(sql`
      insert into probability_snapshots (effective_at, payload) values (${TOWER_SECTION_11_OPEN_ISO}::timestamptz, ${JSON.stringify(payload)}::jsonb) returning id
    `)) as unknown as { id: string }[];
    return snap?.id ?? null;
  });
  if (!out) return { snapshotId: null };
  console.log(`[tower-open] 11구간 공시 스냅샷 id=${out}`);
  return { snapshotId: out };
}
