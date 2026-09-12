import 'server-only';

import { unstable_cache } from 'next/cache';
import { sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { withTimeout } from '@/lib/db/with-timeout';

/**
 * "지금 인생강화는" 사회적 증거 통계. /login·/u 프로필 카드 전용.
 *
 * 두 종류:
 *  - totalUsers: 전체 가입 유저 수(`profiles` 행 수). 천천히 변해 90s 캐시면 충분.
 *  - totals: `enhancement_logs` 누적 성공/유지/하락. 'mega'는 'success'에 합산(GDD §3.2).
 *    ⚠ 전수 집계는 **읽기 경로에서 돌리지 않는다** — 실측(81일)에서 95,625회 · 평균 57.6ms로
 *    DB 실행시간의 15.8%를 먹는 단일 1위였다. 앞에 unstable_cache(10분)가 있었는데도 캐시가
 *    인스턴스 단위로 갈려 기대치의 8배가 DB까지 내려왔다. 지금은 크론이 enhance_totals 한 행에
 *    10분마다 채우고(refreshEnhanceTotals) 읽기는 그 행만 본다(0198).
 */
export type EnhanceLive = {
  totalUsers: number;
  /** null = 아직 스냅샷 없음/조회 실패 — 카드가 0이 아니라 "—"로 그린다. */
  success: number | null;
  hold: number | null;
  down: number | null;
};

async function rawTotalUsers(): Promise<number> {
  const rows = (await db.execute(sql`
    select count(*)::bigint as c from profiles
  `)) as unknown as { c: string | bigint }[];
  return Number(rows[0]?.c ?? 0);
}

type Totals = Omit<EnhanceLive, 'totalUsers'>;
const NO_TOTALS: Totals = { success: null, hold: null, down: null };

/** 스냅샷 한 행 읽기 — 없으면 null(카드가 "—"로 그린다). 인덱스 없이도 1행이라 상수 비용. */
async function rawEnhanceTotals(): Promise<Totals> {
  const rows = (await db.execute(sql`
    select success::text, hold::text, down::text from enhance_totals where id = 1
  `)) as unknown as { success: string; hold: string; down: string }[];
  const r = rows[0];
  if (!r) return NO_TOTALS;
  return { success: Number(r.success), hold: Number(r.hold), down: Number(r.down) };
}

/**
 * 스냅샷 갱신 — 크론에서만 호출(warm, 10분 간격). 전수 집계는 여기 한 곳에만 남는다.
 * 반환: 갱신했으면 true, 아직 신선해 건너뛰었으면 false.
 */
export async function refreshEnhanceTotals(maxAgeMs = 10 * 60_000): Promise<boolean> {
  const [fresh] = (await db.execute(sql`
    select 1 from enhance_totals
    where id = 1 and computed_at > now() - ${sql.raw(`interval '${Math.round(maxAgeMs / 1000)} seconds'`)}
  `)) as unknown as unknown[];
  if (fresh) return false;
  await db.execute(sql`
    insert into enhance_totals (id, success, hold, down, computed_at)
    select 1,
      coalesce(sum(case when result in ('success','mega') then 1 else 0 end), 0),
      coalesce(sum(case when result = 'hold' then 1 else 0 end), 0),
      coalesce(sum(case when result = 'down' then 1 else 0 end), 0),
      now()
    from enhancement_logs
    on conflict (id) do update set
      success = excluded.success, hold = excluded.hold,
      down = excluded.down, computed_at = excluded.computed_at
  `);
  return true;
}

// 전체 유저 수 90s — 천천히 변해 캐시 충분. count(*)이라 비용 낮음.
const cachedTotalUsers = unstable_cache(rawTotalUsers, ['stats:total-users'], {
  revalidate: 90,
  tags: ['stats'],
});

// 누적 60s — 스냅샷 자체가 10분 주기라 읽기 캐시는 왕복만 줄이면 된다(값은 어차피 안 변함).
const cachedEnhanceTotals = unstable_cache(rawEnhanceTotals, ['stats:enhance-totals'], {
  revalidate: 60,
  tags: ['stats'],
});

export async function getEnhanceLive(): Promise<EnhanceLive> {
  const [totalUsers, totals] = await Promise.all([
    withTimeout(cachedTotalUsers(), 1500, 'stats.totalUsers').catch(() => 0),
    // 실패 시 0이 아니라 null — 0은 "강화가 한 번도 없었다"는 거짓말이라 카드가 "—"로 그린다.
    withTimeout(cachedEnhanceTotals(), 3000, 'stats.enhanceTotals').catch(() => NO_TOTALS),
  ]);
  return { totalUsers, ...totals };
}
