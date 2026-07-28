'use server';

import { and, eq, ilike, ne, or, sql } from 'drizzle-orm';

import { getSessionUserId } from '@/lib/auth/session';
import { rateLimited } from '@/lib/ratelimit';
import { db } from '@/lib/db/client';
import { profiles } from '@/lib/db/schema/profiles';
import { characters } from '@/lib/db/schema/server';
import { userProfiles } from '@/lib/db/schema/avatar';
import { runes } from '@/lib/db/schema/rune';
import { getActiveServerId } from '@/lib/game/servers';
import type { AvatarAttr } from '@/lib/game/balance';

export type OpponentResult = {
  userId: string;
  nickname: string;
  south: string | null;
  attrs: AvatarAttr[];
};

/**
 * 상성 대결용 상대 검색 — 닉네임(부분)·공개코드(정확). 대표 아바타 이미지 + 속성 동봉.
 * 상대 속성 공개는 사용자 확정(2026-07-28) — 대표 아바타 = 속성이라 아바타가 공개인 이상
 * 파생 정보이며, 대결 기능 자체가 상대를 알아야 성립한다.
 */
export async function searchOpponentAction(qRaw: string): Promise<
  { status: 'success'; results: OpponentResult[] } | { status: 'error'; message: string }
> {
  const userId = await getSessionUserId();
  if (!userId) return { status: 'error', message: '로그인이 필요합니다.' };
  if (await rateLimited(userId, 'profileEdit'))
    return { status: 'error', message: '잠시 후 다시 시도해 주세요.' };

  const q = qRaw.trim().slice(0, 30);
  if (!q) return { status: 'success', results: [] };
  // LIKE 와일드카드 리터럴화 — '%' 단독 검색으로 풀스캔 유발 방지(friends.searchUsers와 동일).
  const safe = q.replace(/[\\%_]/g, '\\$&');
  const serverId = await getActiveServerId();

  try {
    const rows = await db
      .select({
        userId: profiles.id,
        nickname: characters.nickname,
        south: sql<string | null>`${userProfiles.rotations} ->> 'south'`,
        attrs: runes.attrs,
      })
      .from(profiles)
      .innerJoin(
        characters,
        and(eq(characters.userId, profiles.id), eq(characters.serverId, serverId)),
      )
      .leftJoin(userProfiles, eq(userProfiles.id, characters.activeProfileId))
      .leftJoin(runes, eq(runes.sourceProfileId, characters.activeProfileId))
      .where(
        and(
          ne(profiles.id, userId),
          or(ilike(characters.nickname, `%${safe}%`), eq(profiles.publicCode, q)),
        ),
      )
      .limit(12);
    return {
      status: 'success',
      results: rows.map((r) => ({
        userId: r.userId,
        nickname: r.nickname ?? '플레이어',
        south: r.south,
        attrs: r.attrs ?? [],
      })),
    };
  } catch (e) {
    console.error('[attr.searchOpponent]', e);
    return { status: 'error', message: '검색에 실패했습니다.' };
  }
}
