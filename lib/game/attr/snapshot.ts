import 'server-only';

import { and, eq, inArray } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { characters } from '@/lib/db/schema/server';
import { runes } from '@/lib/db/schema/rune';
import { attrDisplayVector, type AttrRegion } from '@/lib/game/balance';

/** 지역별 표기 합(0~150). 속성 미보유·아바타 없음이면 빈 객체. */
export type AttrVector = Partial<Record<AttrRegion, number>>;

/**
 * 전투 정산용 속성 스냅샷 — **대표 아바타(active_profile_id)의 속성**을 유저별로 모은다.
 * 속성은 아바타 1:1 종속(0141)이라 조인 한 번으로 끝나고, 정산 시점에 읽는 값이 곧 스냅샷이다
 * (점령전 23:00 / 대난투 09:00 — 그 시각의 대표 아바타 기준, §10).
 * 결과에 없는 유저 = 속성 없음(보정 0)으로 취급.
 */
export async function loadAttrVectors(
  serverId: number,
  userIds: readonly string[],
): Promise<Map<string, AttrVector>> {
  const out = new Map<string, AttrVector>();
  if (userIds.length === 0) return out;

  // 인자 상한 방어 — 대난투는 서버 전 유저가 대상이라 청크로 나눠 조회.
  const CHUNK = 1000;
  for (let i = 0; i < userIds.length; i += CHUNK) {
    const slice = userIds.slice(i, i + CHUNK);
    const rows = await db
      .select({ userId: characters.userId, attrs: runes.attrs })
      .from(characters)
      .innerJoin(runes, eq(runes.sourceProfileId, characters.activeProfileId))
      .where(and(eq(characters.serverId, serverId), inArray(characters.userId, slice)));
    for (const r of rows) out.set(r.userId, attrDisplayVector(r.attrs));
  }
  return out;
}
