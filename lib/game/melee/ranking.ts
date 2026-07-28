import 'server-only';

import { and, asc, eq, gt, inArray, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { profiles } from '@/lib/db/schema/profiles';
import { characters } from '@/lib/db/schema/server';
import { userProfiles } from '@/lib/db/schema/avatar';
import { meleeParticipants } from '@/lib/db/schema/melee';
import { guildMembers } from '@/lib/db/schema/guild';
import { parseFaceBox, type FaceBox } from '@/components/faceCrop';
import { withTimeout } from '@/lib/db/with-timeout';

/** 순위표 한 줄 — 아바타(얼굴 크롭용 faceBox 포함)·길드 스냅샷·전적. */
export type MeleeRankRow = {
  rank: number;
  userId: string;
  nickname: string;
  publicCode: string | null;
  avatar: string | null;
  faceBox: FaceBox | null;
  /** 회차 시점 길드 스냅샷(0138 이전 회차는 null). */
  guildName: string | null;
  guildEmblemUrl: string | null;
  /** 공격 성공 = 내가 쓰러뜨린 수. */
  attackSuccess: number;
  /** 방어 성공 = 피격 중 버텨낸 수(탈락자는 마지막 피격 제외). */
  defenseSuccess: number;
  /** 나를 쓰러뜨린 사람(챔피언은 null). */
  killerNickname: string | null;
  /** 탈락 라운드(0138 이전 회차는 null). */
  eliminatedRound: number | null;
};

export type MeleeRankMode = 'all' | 'near' | 'guild';
export const MELEE_RANK_PAGE = 50;

/** 아바타 정면 + faceBox — 순위 행의 얼굴 확대에 쓴다. */
const SOUTH = sql<string | null>`${userProfiles.rotations} ->> 'south'`;
const FACEBOX = sql<unknown>`${userProfiles.options} -> 'faceBox'`;

/**
 * 대난투 전체 순위 — 등수 오름차순 keyset 페이지네이션(인덱스 melee_part_rank_idx 활용).
 *  - all   : 1위부터(또는 afterRank 이후)
 *  - near  : 내 등수 기준 앞뒤 window
 *  - guild : 내 길드원만(현재 길드 기준 — 스냅샷 길드가 아닌 "지금 같은 길드"인 사람들)
 *
 * 길드 표시값은 **회차 스냅샷**(participants.guild_name)만 쓴다 — 현재 길드로 폴백하면 과거
 * 회차에 지금 길드가 새어 들어간다(finale.roster 규칙과 동일).
 */
export async function getMeleeRanking(input: {
  battleId: bigint;
  serverId: number;
  viewerUserId: string;
  mode: MeleeRankMode;
  /** all 모드 커서 — 이 등수 다음부터. */
  afterRank?: number;
  /** near 모드 창 크기(위아래 각각). */
  window?: number;
}): Promise<{ rows: MeleeRankRow[]; myRank: number | null; hasMore: boolean }> {
  const { battleId, serverId, viewerUserId, mode } = input;

  const [meRow] = await db
    .select({ rank: meleeParticipants.finalRank })
    .from(meleeParticipants)
    .where(and(eq(meleeParticipants.battleId, battleId), eq(meleeParticipants.userId, viewerUserId)))
    .limit(1);
  const myRank = meRow?.rank ?? null;

  // 모드별 대상 등수 범위/필터.
  const conds = [eq(meleeParticipants.battleId, battleId)];
  let limit = MELEE_RANK_PAGE;
  if (mode === 'near') {
    const w = input.window ?? 4;
    if (myRank == null) return { rows: [], myRank: null, hasMore: false };
    conds.push(
      sql`${meleeParticipants.finalRank} between ${Math.max(1, myRank - w)} and ${myRank + w}`,
    );
    limit = w * 2 + 1;
  } else if (mode === 'guild') {
    // 현재 같은 길드인 참가자 — 길드 탭은 "지금 우리 길드원의 성적"을 보는 용도.
    const [mine] = await db
      .select({ guildId: guildMembers.guildId })
      .from(guildMembers)
      .where(and(eq(guildMembers.userId, viewerUserId), eq(guildMembers.serverId, serverId)))
      .limit(1);
    if (!mine) return { rows: [], myRank, hasMore: false };
    const mates = await db
      .select({ userId: guildMembers.userId })
      .from(guildMembers)
      .where(and(eq(guildMembers.guildId, mine.guildId), eq(guildMembers.serverId, serverId)));
    const ids = mates.map((m) => m.userId);
    if (ids.length === 0) return { rows: [], myRank, hasMore: false };
    conds.push(inArray(meleeParticipants.userId, ids));
  } else if (input.afterRank != null) {
    conds.push(gt(meleeParticipants.finalRank, input.afterRank));
  }

  const rows = await withTimeout(
    db
      .select({
        rank: meleeParticipants.finalRank,
        userId: meleeParticipants.userId,
        nickname: characters.nickname,
        code: profiles.publicCode,
        avatar: SOUTH,
        faceBoxRaw: FACEBOX,
        guildName: meleeParticipants.guildName,
        guildEmblemUrl: meleeParticipants.guildEmblemUrl,
        defenseCount: meleeParticipants.defenseCount,
        eliminatedRound: meleeParticipants.eliminatedRound,
        killerUserId: meleeParticipants.killerUserId,
        // 공격 성공 — killer 기록 기반 전판 정확값(내 전투 요약과 동일 기준).
        kills: sql<number>`(select count(*)::int from melee_participants mp2
          where mp2.battle_id = ${battleId} and mp2.killer_user_id = ${meleeParticipants.userId})`,
      })
      .from(meleeParticipants)
      .innerJoin(profiles, eq(profiles.id, meleeParticipants.userId))
      .innerJoin(
        characters,
        and(eq(characters.userId, meleeParticipants.userId), eq(characters.serverId, serverId)),
      )
      .leftJoin(userProfiles, eq(userProfiles.id, characters.activeProfileId))
      .where(and(...conds))
      .orderBy(asc(meleeParticipants.finalRank))
      .limit(limit + 1),
    4000,
    'melee.ranking',
  ).catch(() => []);

  const hasMore = mode === 'all' && rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;

  // 나를 쓰러뜨린 사람 닉네임 — 한 번에 조회(N+1 방지).
  const killerIds = [...new Set(page.map((r) => r.killerUserId).filter((v): v is string => !!v))];
  const killerNick = new Map<string, string>();
  if (killerIds.length > 0) {
    const ks = await db
      .select({ uid: characters.userId, nick: characters.nickname })
      .from(characters)
      .where(and(eq(characters.serverId, serverId), inArray(characters.userId, killerIds)));
    for (const k of ks) killerNick.set(k.uid, k.nick ?? '플레이어');
  }

  return {
    myRank,
    hasMore,
    rows: page.map((r) => ({
      rank: r.rank,
      userId: r.userId,
      nickname: r.nickname ?? '플레이어',
      publicCode: r.code,
      avatar: r.avatar,
      faceBox: parseFaceBox(r.faceBoxRaw),
      guildName: r.guildName,
      guildEmblemUrl: r.guildEmblemUrl,
      attackSuccess: Number(r.kills),
      // 탈락자는 마지막 피격 1회가 탈락이므로 방어 성공에서 제외(내 전투 요약과 동일 기준).
      defenseSuccess: Math.max(0, r.defenseCount - (r.rank > 1 ? 1 : 0)),
      killerNickname: r.killerUserId ? (killerNick.get(r.killerUserId) ?? null) : null,
      eliminatedRound: r.eliminatedRound,
    })),
  };
}
