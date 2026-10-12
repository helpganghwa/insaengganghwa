import 'server-only';
import { sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { kstDateString } from '@/lib/kst';

/**
 * 어제 보급 상자를 가장 많이 연 사람(서버별) — 칭호 open_king(어제 1위) 판정·표시 공용.
 *
 * 예전엔 판정마다 supply_open_logs 전체(240만 행)를 날짜 함수로 훑어 호출당 0.7초였다(10-12 2서버 조사 H2).
 * 하루 안에는 답이 바뀌지 않으므로 인스턴스 메모리에 서버×KST 날짜로 한 번만 계산해 둔다. 조회는 created_at 범위 조건이라
 * (server_id, created_at) 인덱스(0241)를 탄다. 자정 직후 뒤늦게 들어온 어제 기록은 10분 뒤 다시 계산할 때 반영된다.
 *
 * '어제'의 경계는 캐시 키와 **같은 시계(JS, KST)**로 잰다(3차 검사 A1-N5·2차 F8) — 종전엔 키는 JS, 범위는 DB now()라
 * 자정 경계에서 두 시계가 어긋나면 "그저께 1위"가 오늘 키로 10분 동안 캐시됐다.
 */
const cache = new Map<string, { uid: string | null; at: number }>();
const raidCache = new Map<string, { uid: string | null; at: number }>();
const TTL_MS = 10 * 60 * 1000;

/** 오늘(KST) 자정과 어제 자정 — ISO 문자열(timestamptz 파라미터). */
function yesterdayBounds(today: string): { from: string; to: string } {
  const todayStart = new Date(`${today}T00:00:00+09:00`);
  return { from: new Date(todayStart.getTime() - 86_400_000).toISOString(), to: todayStart.toISOString() };
}

export async function yesterdayOpenTop(serverId: number): Promise<string | null> {
  const today = kstDateString();
  const key = `${serverId}:${today}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.uid;
  const { from, to } = yesterdayBounds(today);
  const rows = (await db.execute(sql`
    select user_id::text as uid
      from supply_open_logs
     where server_id = ${serverId}
       and created_at >= ${from}::timestamptz
       and created_at <  ${to}::timestamptz
     group by 1 order by count(*) desc, 1 limit 1
  `)) as unknown as { uid: string }[];
  const uid = rows[0]?.uid ?? null;
  // 하루가 바뀌면 키가 바뀌므로 옛 날짜 항목은 지운다(서버 수 × 1건만 남는다).
  for (const k of cache.keys()) if (!k.endsWith(today)) cache.delete(k);
  cache.set(key, { uid, at: Date.now() });
  return uid;
}

/**
 * 어제 레이드 피해 1위(서버별) — 칭호 raid_hero 판정·표시 공용. open_king과 같은 이유(raid_attacks 전체 스캔 7,387, 2차 검사 L3).
 * 범위 조건은 raid_attacks(created_at) 인덱스(0242)를 탄다.
 */
export async function yesterdayRaidTop(serverId: number): Promise<string | null> {
  const today = kstDateString();
  const key = `${serverId}:${today}`;
  const hit = raidCache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.uid;
  const { from, to } = yesterdayBounds(today);
  const rows = (await db.execute(sql`
    select ra.user_id::text as uid
      from raid_attacks ra join raids r on r.id = ra.raid_id
     where r.server_id = ${serverId}
       and ra.created_at >= ${from}::timestamptz
       and ra.created_at <  ${to}::timestamptz
     group by 1 order by sum(ra.damage) desc, 1 limit 1
  `)) as unknown as { uid: string }[];
  const uid = rows[0]?.uid ?? null;
  for (const k of raidCache.keys()) if (!k.endsWith(today)) raidCache.delete(k);
  raidCache.set(key, { uid, at: Date.now() });
  return uid;
}
