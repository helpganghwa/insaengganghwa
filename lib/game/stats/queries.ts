import 'server-only';

import { unstable_cache } from 'next/cache';
import { sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { withTimeout } from '@/lib/db/with-timeout';

/**
 * "지금 인생강화는" 사회적 증거 통계. /u 프로필 카드 전용.
 *
 * 두 종류:
 *  - totalUsers: 전체 가입 유저 수(`profiles` 행 수). 천천히 변해 90s 캐시면 충분.
 *  - totals: `enhancement_logs` 누적 성공/유지/하락. 운영 5년에 수억 row까지
 *    커질 수 있어 10분 캐시 + withTimeout. 'mega'는 'success'에 합산(GDD §3.2).
 */
export type EnhanceLive = {
  totalUsers: number;
  success: number;
  hold: number;
  down: number;
};

async function rawTotalUsers(): Promise<number> {
  const rows = (await db.execute(sql`
    select count(*)::bigint as c from profiles
  `)) as unknown as { c: string | bigint }[];
  return Number(rows[0]?.c ?? 0);
}

async function rawEnhanceTotals(): Promise<Omit<EnhanceLive, 'totalUsers'>> {
  const rows = (await db.execute(sql`
    select
      coalesce(sum(case when result in ('success','mega') then 1 else 0 end), 0)::bigint as success,
      coalesce(sum(case when result = 'hold' then 1 else 0 end), 0)::bigint as hold,
      coalesce(sum(case when result = 'down' then 1 else 0 end), 0)::bigint as down
    from enhancement_logs
  `)) as unknown as { success: string | bigint; hold: string | bigint; down: string | bigint }[];
  const r = rows[0];
  return {
    success: Number(r?.success ?? 0),
    hold: Number(r?.hold ?? 0),
    down: Number(r?.down ?? 0),
  };
}

// 전체 유저 수 90s — 천천히 변해 캐시 충분. count(*)이라 비용 낮음.
const cachedTotalUsers = unstable_cache(rawTotalUsers, ['stats:total-users'], {
  revalidate: 90,
  tags: ['stats'],
});

// 누적 10분 — 사회적 증거는 분 단위 정밀도 불필요, 큰 테이블 전수 집계 비용 ↓.
const cachedEnhanceTotals = unstable_cache(rawEnhanceTotals, ['stats:enhance-totals'], {
  revalidate: 600,
  tags: ['stats'],
});

export async function getEnhanceLive(): Promise<EnhanceLive> {
  const [totalUsers, totals] = await Promise.all([
    withTimeout(cachedTotalUsers(), 1500, 'stats.totalUsers').catch(() => 0),
    withTimeout(cachedEnhanceTotals(), 3000, 'stats.enhanceTotals').catch(() => ({
      success: 0,
      hold: 0,
      down: 0,
    })),
  ]);
  return { totalUsers, ...totals };
}
