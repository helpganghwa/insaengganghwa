import 'server-only';

import { sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';

import { enhanceMomentTitles } from './moment-rules';

/**
 * 순간 사건 칭호의 지급 훅(소규모 업데이트 17, 2026-11-04 · 전부 숨김) — 판정(judge)으로는 되짚을 수 없거나
 * 공개 시각을 지켜야 하는 것만. 규칙은 moment-rules.ts(순수), 여기는 원장 insert만 한다.
 * 실패해도 강화·점령전 결과는 그대로다(best-effort, 호출부가 catch). 이미 가진 칭호는 PK로 건너뛴다.
 * 점령전 단신 2종은 conquest-grants.ts(점령전 집계를 끌고 오므로 강화 수령 경로와 분리).
 */

export async function grantTitleCodes(userId: string, serverId: number, codes: readonly string[]): Promise<void> {
  if (codes.length === 0) return;
  await db.execute(sql`
    insert into user_titles (user_id, server_id, title_code)
    select ${userId}::uuid, ${serverId}, unnest(array[${sql.join(codes.map((c) => sql`${c}`), sql`, `)}]::text[])
    on conflict (user_id, server_id, title_code) do nothing
  `);
}

/** 강화 결과 수령 직후(applyEnhancePostEffects) — 바늘구멍·찾을 수 없음·신데렐라. */
export async function grantEnhanceMomentTitles(r: {
  userId: string;
  serverId: number;
  outcome: string;
  fromLevel: number;
  toLevel: number;
  effectiveRateBp: number;
  resolvedAt: Date | number;
}): Promise<void> {
  await grantTitleCodes(r.userId, r.serverId, enhanceMomentTitles(r));
}
