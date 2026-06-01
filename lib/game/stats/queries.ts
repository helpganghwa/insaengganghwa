import 'server-only';

import { unstable_cache } from 'next/cache';
import { sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { withTimeout } from '@/lib/db/with-timeout';

/**
 * "지금 인생강화는" 사회적 증거 통계. /u 프로필 카드 전용.
 *
 * 두 종류:
 *  - active: 지금 큐(`enhancement_jobs.status='running'`)의 distinct user 수.
 *    인덱스 부분(running only) 있어 가벼움. 90s 캐시.
 *  - totals: `enhancement_logs` 누적 성공/유지/하락. 운영 5년에 수억 row까지
 *    커질 수 있어 10분 캐시 + withTimeout. 'mega'는 'success'에 합산(GDD §3.2).
 */
export type EnhanceLive = {
  activeUsers: number;
  success: number;
  hold: number;
  down: number;
};

async function rawActiveUsers(): Promise<number> {
  const rows = (await db.execute(sql`
    select count(distinct user_id)::bigint as c
    from enhancement_jobs
    where status = 'running'
  `)) as unknown as { c: string | bigint }[];
  return Number(rows[0]?.c ?? 0);
}

async function rawEnhanceTotals(): Promise<Omit<EnhanceLive, 'activeUsers'>> {
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

// 활성자 90s — '지금'의 가독성 ↑(분 단위 변화 반영). 인덱스 hit이라 비용 낮음.
const cachedActiveUsers = unstable_cache(rawActiveUsers, ['stats:active-users'], {
  revalidate: 90,
  tags: ['stats'],
});

// 누적 10분 — 사회적 증거는 분 단위 정밀도 불필요, 큰 테이블 전수 집계 비용 ↓.
const cachedEnhanceTotals = unstable_cache(rawEnhanceTotals, ['stats:enhance-totals'], {
  revalidate: 600,
  tags: ['stats'],
});

export async function getEnhanceLive(): Promise<EnhanceLive> {
  const [activeUsers, totals] = await Promise.all([
    withTimeout(cachedActiveUsers(), 1500, 'stats.activeUsers').catch(() => 0),
    withTimeout(cachedEnhanceTotals(), 3000, 'stats.enhanceTotals').catch(() => ({
      success: 0,
      hold: 0,
      down: 0,
    })),
  ]);
  return { activeUsers, ...totals };
}
