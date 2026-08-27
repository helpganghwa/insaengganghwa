import 'server-only';

import { and, asc, desc, eq, gt, inArray, lt, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { profiles } from '@/lib/db/schema/profiles';
import { characters } from '@/lib/db/schema/server';
import { userProfiles } from '@/lib/db/schema/avatar';
import { meleeParticipants, meleeBattles } from '@/lib/db/schema/melee';
import { guildMembers } from '@/lib/db/schema/guild';
import { getFriendIds } from '@/lib/game/friends';
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
  /** 나를 쓰러뜨린 사람(챔피언은 null). 프로필 링크용 공개코드 동봉. */
  killerNickname: string | null;
  killerPublicCode: string | null;
  /** 탈락 라운드(0138 이전 회차는 null). */
  eliminatedRound: number | null;
};

export type MeleeRankMode = 'all' | 'guild' | 'friends';
export const MELEE_RANK_PAGE = 30;
/** 내 순위 점프의 초기 창(위아래 각각). 화면을 채우고 양방향 스크롤 여지를 남긴다. */
export const MELEE_RANK_WINDOW = 12;

/** 아바타 정면 + faceBox — 순위 행의 얼굴 확대에 쓴다. */
const SOUTH = sql<string | null>`${userProfiles.rotations} ->> 'south'`;
const FACEBOX = sql<unknown>`${userProfiles.options} -> 'faceBox'`;

/**
 * 대난투 전체 순위 — 등수 오름차순 keyset 페이지네이션(인덱스 melee_part_rank_idx 활용).
 *  - all   : 1위부터(또는 afterRank 이후). aroundRank가 오면 그 등수 앞뒤 window
 *  - guild : 내 길드원만(현재 길드 기준 — 스냅샷 길드가 아닌 "지금 같은 길드"인 사람들)
 *  - friends : 나 + 현재 친구(수락된 친구 링크 기준, 2026-08-28)
 *
 * 표시값은 전부 **회차 스냅샷**(participants)이다 — 닉·아바타·길드. 현재 값으로 폴백하면 개명·
 * 아바타 변경·길드 이동이 과거 회차에 새어 들어가, 같은 화면의 전투 재생(finale.roster 스냅샷)과
 * 어긋난다. 스냅샷이 없는 옛 회차(0138/0140 이전)만 실시간 값으로 폴백한다.
 */
export async function getMeleeRanking(input: {
  battleId: bigint;
  serverId: number;
  viewerUserId: string;
  mode: MeleeRankMode;
  /** 아래 방향 커서 — 이 등수 **다음**부터 오름차순. */
  afterRank?: number;
  /** 위 방향 커서 — 이 등수 **이전**을 내림차순으로 집고 오름차순으로 되돌려 반환. */
  beforeRank?: number;
  /** 이 등수 주변 창(위아래 각각 MELEE_RANK_WINDOW). 내 순위 점프용. */
  aroundRank?: number;
}): Promise<{ rows: MeleeRankRow[]; myRank: number | null }> {
  const { battleId, serverId, viewerUserId, mode } = input;

  // 발표 게이트(전수 감사 2026-08-21) — computed 상태(09시 산출~10시 발표 사이)의 결과가
  // 이 API로 전부 유출됐다(MELEE.md §"발표 전 조회 차단" 위반). 타 서버 배틀도 거부.
  const [battle] = await db
    .select({ status: meleeBattles.status, serverId: meleeBattles.serverId })
    .from(meleeBattles)
    .where(eq(meleeBattles.id, battleId))
    .limit(1);
  if (!battle || battle.status !== 'revealed' || battle.serverId !== serverId) {
    return { rows: [], myRank: null };
  }

  const [meRow] = await db
    .select({ rank: meleeParticipants.finalRank })
    .from(meleeParticipants)
    .where(and(eq(meleeParticipants.battleId, battleId), eq(meleeParticipants.userId, viewerUserId)))
    .limit(1);
  const myRank = meRow?.rank ?? null;

  // 모드별 대상 등수 범위/필터.
  const conds = [eq(meleeParticipants.battleId, battleId)];
  let limit = MELEE_RANK_PAGE;
  let backward = false; // 위 방향 조회 — 내림차순으로 집고 오름차순으로 되돌린다.

  if (input.beforeRank != null) {
    conds.push(lt(meleeParticipants.finalRank, input.beforeRank));
    backward = true;
  } else if (input.afterRank != null) {
    conds.push(gt(meleeParticipants.finalRank, input.afterRank));
  } else if (input.aroundRank != null) {
    const around = input.aroundRank;
    const w = MELEE_RANK_WINDOW;
    conds.push(
      sql`${meleeParticipants.finalRank} between ${Math.max(1, around - w)} and ${around + w}`,
    );
    limit = w * 2 + 1;
  }

  if (mode === 'guild') {
    // 현재 같은 길드인 참가자 — 길드 탭은 "지금 우리 길드원의 성적"을 보는 용도.
    const [mine] = await db
      .select({ guildId: guildMembers.guildId })
      .from(guildMembers)
      .where(and(eq(guildMembers.userId, viewerUserId), eq(guildMembers.serverId, serverId)))
      .limit(1);
    if (!mine) return { rows: [], myRank };
    const mates = await db
      .select({ userId: guildMembers.userId })
      .from(guildMembers)
      .where(and(eq(guildMembers.guildId, mine.guildId), eq(guildMembers.serverId, serverId)));
    const ids = mates.map((m) => m.userId);
    if (ids.length === 0) return { rows: [], myRank };
    conds.push(inArray(meleeParticipants.userId, ids));
    limit = 200; // 길드 인원은 유계 — 한 번에 로드(무한 스크롤 대상 아님).
  }

  if (mode === 'friends') {
    // 나 + 수락된 친구 — 길드 탭과 같은 "지금 관계" 기준, 유계라 한 번에 로드.
    const ids = [viewerUserId, ...(await getFriendIds(viewerUserId, serverId))];
    conds.push(inArray(meleeParticipants.userId, ids));
    limit = 200;
  }

  const rows = await withTimeout(
    db
      .select({
        rank: meleeParticipants.finalRank,
        userId: meleeParticipants.userId,
        nickname: meleeParticipants.nickname,
        liveNickname: characters.nickname,
        code: profiles.publicCode,
        snapAvatar: meleeParticipants.avatar,
        snapFaceBox: meleeParticipants.faceBox,
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
      // characters는 폴백용이라 leftJoin — 스냅샷이 있으면 서버 이동으로 캐릭터가 없어도 순위에 남는다.
      .leftJoin(
        characters,
        and(eq(characters.userId, meleeParticipants.userId), eq(characters.serverId, serverId)),
      )
      .leftJoin(userProfiles, eq(userProfiles.id, characters.activeProfileId))
      .where(and(...conds))
      .orderBy(backward ? desc(meleeParticipants.finalRank) : asc(meleeParticipants.finalRank))
      .limit(limit),
    4000,
    'melee.ranking',
  ).catch(() => []);

  // 위 방향은 내림차순으로 집었으므로 표시 순서(오름차순)로 되돌린다.
  const page = backward ? [...rows].reverse() : rows;

  // 나를 쓰러뜨린 사람 닉네임 — 한 번에 조회(N+1 방지). 같은 회차 참가자라 스냅샷 닉이 있고,
  // 없으면(옛 회차) 실시간 닉으로 폴백. 상대 이름도 순위 행과 같은 기준이어야 어긋나지 않는다.
  const killerIds = [...new Set(page.map((r) => r.killerUserId).filter((v): v is string => !!v))];
  const killerNick = new Map<string, { nick: string; code: string | null }>();
  if (killerIds.length > 0) {
    const ks = await db
      .select({
        uid: meleeParticipants.userId,
        snapNick: meleeParticipants.nickname,
        liveNick: characters.nickname,
        code: profiles.publicCode,
      })
      .from(meleeParticipants)
      .innerJoin(profiles, eq(profiles.id, meleeParticipants.userId))
      .leftJoin(
        characters,
        and(eq(characters.userId, meleeParticipants.userId), eq(characters.serverId, serverId)),
      )
      .where(
        and(
          eq(meleeParticipants.battleId, battleId),
          inArray(meleeParticipants.userId, killerIds),
        ),
      );
    for (const k of ks) {
      killerNick.set(k.uid, { nick: k.snapNick ?? k.liveNick ?? '플레이어', code: k.code });
    }
  }

  return {
    myRank,
    rows: page.map((r) => {
      // 아바타와 얼굴박스는 **쌍**으로 고른다 — 스냅샷 아바타에 현재 박스를 씌우면 크롭이 어긋난다.
      const snap = r.snapAvatar != null;
      return {
        rank: r.rank,
        userId: r.userId,
        nickname: r.nickname ?? r.liveNickname ?? '플레이어',
        publicCode: r.code,
        avatar: snap ? r.snapAvatar : r.avatar,
        faceBox: parseFaceBox(snap ? r.snapFaceBox : r.faceBoxRaw),
        guildName: r.guildName,
        guildEmblemUrl: r.guildEmblemUrl,
        attackSuccess: Number(r.kills),
        // 탈락자는 마지막 피격 1회가 탈락이므로 방어 성공에서 제외(내 전투 요약과 동일 기준).
        defenseSuccess: Math.max(0, r.defenseCount - (r.rank > 1 ? 1 : 0)),
        killerNickname: r.killerUserId ? (killerNick.get(r.killerUserId)?.nick ?? null) : null,
        killerPublicCode: r.killerUserId ? (killerNick.get(r.killerUserId)?.code ?? null) : null,
        eliminatedRound: r.eliminatedRound,
      };
    }),
  };
}
