import 'server-only';

import { cache } from 'react';
import { and, eq, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { withTimeout, DbTimeoutError } from '@/lib/db/with-timeout';
import { profiles } from '@/lib/db/schema/profiles';
import { userCodex } from '@/lib/db/schema/equipment';

/**
 * 아이템별 강화 랭킹 / 챔피언 — BALANCE §3.3 / SCHEMA §2.3 / WIREFRAMES §7.2.
 *
 * catalog_item 1개당 순위: `max_enhance_level` DESC → `max_enhance_reached_at` ASC
 * (먼저 달성) → `user_id` ASC(완전 결정성). **확률 없음**(§33 비대상).
 * 챔피언 = 1위, 단 `max_enhance_level ≥ 1`(+0뿐이면 챔피언/순위 없음).
 */
const TOP = 10;

export type ItemRankEntry = {
  userId: string;
  nickname: string;
  /** 불변 공개 코드 — /u 링크 식별자. */
  publicCode: string;
  maxLevel: number;
  rank: number;
};

/** 해당 아이템 Top10 (강화 ≥ 1만, 동률은 먼저 달성 순). */
export async function getItemTop10(catalogItemId: number): Promise<ItemRankEntry[]> {
  const rows = await db
    .select({
      userId: userCodex.userId,
      nickname: profiles.nickname,
      publicCode: profiles.publicCode,
      maxLevel: userCodex.maxEnhanceLevel,
    })
    .from(userCodex)
    .innerJoin(profiles, eq(profiles.id, userCodex.userId))
    .where(and(eq(userCodex.catalogItemId, catalogItemId), sql`${userCodex.maxEnhanceLevel} > 0`))
    .orderBy(
      sql`${userCodex.maxEnhanceLevel} desc, ${userCodex.maxEnhanceReachedAt} asc, ${userCodex.userId} asc`,
    )
    .limit(TOP);
  return rows.map((r, i) => ({ ...r, rank: i + 1 }));
}

/** 내 그 아이템 순위 (미획득·+0뿐 = null). 결정적 타이브레이크로 정확한 #. */
export async function getMyItemRank(
  catalogItemId: number,
  userId: string,
): Promise<{ rank: number; maxLevel: number } | null> {
  const [me] = await db
    .select({ maxLevel: userCodex.maxEnhanceLevel })
    .from(userCodex)
    .where(and(eq(userCodex.userId, userId), eq(userCodex.catalogItemId, catalogItemId)))
    .limit(1);
  if (!me || me.maxLevel <= 0) return null;

  // me 값(레벨·달성시각·user_id)을 JS로 왕복시키지 않고 self-join으로 컬럼-대-컬럼
  // 비교 — raw sql 파라미터에 JS Date를 넣으면 postgres.js 직렬화 실패(ERR_INVALID_
  // ARG_TYPE), text→uuid 비교도 연산자 없음. 파라미터는 ${userId}::uuid·int만.
  const rows = (await db.execute(sql`
    select count(*)::int as ahead
    from user_codex o
    join user_codex me
      on me.user_id = ${userId}::uuid and me.catalog_item_id = ${catalogItemId}
    where o.catalog_item_id = ${catalogItemId}
      and o.max_enhance_level > 0
      and (
        o.max_enhance_level > me.max_enhance_level
        or (o.max_enhance_level = me.max_enhance_level and o.max_enhance_reached_at < me.max_enhance_reached_at)
        or (o.max_enhance_level = me.max_enhance_level and o.max_enhance_reached_at = me.max_enhance_reached_at and o.user_id < me.user_id)
      )
  `)) as unknown as { ahead: number }[];
  return { rank: Number(rows[0]?.ahead ?? 0) + 1, maxLevel: me.maxLevel };
}

/**
 * 한 유저가 챔피언인 catalog_item 집합 — 표시처별 1쿼리 일괄(N+1 금지, CLAUDE §11.4).
 * 자기보다 상위(레벨↑ / 동률·먼저달성 / 동률·동시각·user_id↓)가 없으면 챔피언.
 *
 * - **요청-범위 dedupe**: `react.cache(userId)` — 같은 요청 트리 안에서 여러 서버
 *   컴포넌트가 호출해도 1회만 DB 쿼리(미래 호출처 추가 시 자동 이득).
 * - **타임아웃 가드**: 3s 초과 시 빈 집합 폴백(챔피언 표식만 안 보임 — 시각 영향만,
 *   페이지/액션 실패 X). 핫패스(전 표시처) hang으로 인한 풀 점유 방지.
 */
export const championCatalogIds = cache(async (userId: string): Promise<Set<number>> => {
  try {
    const rows = (await withTimeout(
      db.execute(sql`
        select uc.catalog_item_id as cid
        from user_codex uc
        where uc.user_id = ${userId}::uuid
          and uc.max_enhance_level > 0
          and not exists (
            select 1 from user_codex o
            where o.catalog_item_id = uc.catalog_item_id
              and (
                o.max_enhance_level > uc.max_enhance_level
                or (o.max_enhance_level = uc.max_enhance_level and o.max_enhance_reached_at < uc.max_enhance_reached_at)
                or (o.max_enhance_level = uc.max_enhance_level and o.max_enhance_reached_at = uc.max_enhance_reached_at and o.user_id < uc.user_id)
              )
          )
      `),
      3000,
      'championCatalogIds',
    )) as unknown as { cid: number }[];
    return new Set(rows.map((r) => Number(r.cid)));
  } catch (e) {
    if (e instanceof DbTimeoutError) {
      console.warn('[championCatalogIds] timeout — empty fallback');
      return new Set();
    }
    throw e;
  }
});
