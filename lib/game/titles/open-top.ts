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
 */
const cache = new Map<string, { uid: string | null; at: number }>();
const TTL_MS = 10 * 60 * 1000;

export async function yesterdayOpenTop(serverId: number): Promise<string | null> {
  const key = `${serverId}:${kstDateString()}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.uid;
  const rows = (await db.execute(sql`
    select user_id::text as uid
      from supply_open_logs
     where server_id = ${serverId}
       and created_at >= (((now() at time zone 'Asia/Seoul')::date - 1)::timestamp at time zone 'Asia/Seoul')
       and created_at <  (((now() at time zone 'Asia/Seoul')::date)::timestamp at time zone 'Asia/Seoul')
     group by 1 order by count(*) desc, 1 limit 1
  `)) as unknown as { uid: string }[];
  const uid = rows[0]?.uid ?? null;
  // 하루가 바뀌면 키가 바뀌므로 옛 날짜 항목은 지운다(서버 수 × 1건만 남는다).
  for (const k of cache.keys()) if (!k.endsWith(kstDateString())) cache.delete(k);
  cache.set(key, { uid, at: Date.now() });
  return uid;
}
