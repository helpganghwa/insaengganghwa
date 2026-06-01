import 'server-only';

import { unstable_cache } from 'next/cache';
import { sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { withTimeout } from '@/lib/db/with-timeout';

/**
 * 누적 강화 통계 — append-only `enhancement_logs` 전수 집계.
 * /u 프로필 하단 "지금 인생강화는" 카드 등 사회적 증거용. 운영 5년차에
 * 수억 row까지 커질 수 있어 **반드시** unstable_cache로 핫패스 격리.
 *
 * 분류(GDD §3.2):
 * - success: 누적 'success' + 'mega' (mega는 큰 성공의 변형 — 마케팅상 같은 범주)
 * - hold:    상태 유지
 * - down:    하락
 */
export type EnhanceTotals = {
  success: number;
  hold: number;
  down: number;
};

async function rawEnhanceTotals(): Promise<EnhanceTotals> {
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

// 10분 TTL — 사회적 증거는 분 단위 정밀도 불필요, 큰 테이블 전수 집계 비용 ↓.
const cachedEnhanceTotals = unstable_cache(rawEnhanceTotals, ['stats:enhance-totals'], {
  revalidate: 600,
  tags: ['stats'],
});

export async function getEnhanceTotals(): Promise<EnhanceTotals> {
  return withTimeout(cachedEnhanceTotals(), 3000, 'stats.enhanceTotals').catch(() => ({
    success: 0,
    hold: 0,
    down: 0,
  }));
}
