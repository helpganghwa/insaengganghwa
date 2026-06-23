import 'server-only';

import { and, eq, inArray, lte, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { withTimeout } from '@/lib/db/with-timeout';
import { meleeBattles, meleeParticipants, type MeleeFinale } from '@/lib/db/schema/melee';
import { profiles } from '@/lib/db/schema/profiles';
import { characters } from '@/lib/db/schema/server';
import { userProfiles } from '@/lib/db/schema/avatar';
import { parseFaceBox, type FaceBox } from '@/components/faceCrop';
import { getGuildBriefsByUsers } from '@/lib/game/guild/badge';
import type { MeleeResultView } from '@/app/(game)/melee/MeleeResult';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type MeleeBattleRow = {
  id: bigint;
  serverId: number;
  battleDate: string;
  participantCount: number;
  totalRounds: number;
  championUserId: string | null;
  finale: MeleeFinale;
};

/**
 * 발표된 대난투 배틀 + 조회 유저 → 결과 뷰(MeleeResultView). 오늘/과거 배틀 공용.
 * 아바타·공개코드·시상대·내 순위·회차(날짜 순서 파생)를 set-based로 구성.
 */
export async function buildMeleeResultView(
  battle: MeleeBattleRow,
  userId: string,
): Promise<MeleeResultView> {
  const finale = battle.finale;
  const championNickname = finale.roster.find((r) => r.rank === 1)?.nickname ?? '챔피언';

  // 회차(제N회) — 이 배틀 날짜 이하 배틀 수(하루 1회).
  const edRows = await withTimeout(
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(meleeBattles)
      .where(and(eq(meleeBattles.serverId, battle.serverId), lte(meleeBattles.battleDate, battle.battleDate))),
    2000,
    'melee.edition',
  ).catch(() => [] as { n: number }[]);
  const edition = edRows[0]?.n ?? 0;

  // finale 로스터 아바타·공개코드(uuid만 조회).
  const rosterIds = finale.roster.map((r) => r.userId).filter((id) => UUID_RE.test(id));
  const avatarOf = new Map<string, string>();
  const codeOf = new Map<string, string>();
  const faceBoxOf = new Map<string, FaceBox>();
  if (rosterIds.length > 0) {
    const av = await withTimeout(
      db
        .select({
          uid: characters.userId,
          code: profiles.publicCode,
          rotations: userProfiles.rotations,
          dir: userProfiles.activeDirection,
          options: userProfiles.options,
        })
        .from(characters)
        .innerJoin(profiles, eq(profiles.id, characters.userId))
        .innerJoin(userProfiles, eq(userProfiles.id, characters.activeProfileId))
        .where(and(eq(characters.serverId, battle.serverId), inArray(characters.userId, rosterIds))),
      3000,
      'melee.avatars',
    ).catch(() => []);
    for (const a of av) {
      const rot = a.rotations as Record<string, string>;
      // 유저가 설정한 방향(activeDirection) 우선 — 없으면 south 폴백.
      const url = (a.dir ? rot[a.dir] : undefined) ?? rot.south;
      if (url) avatarOf.set(a.uid, url);
      if (a.code) codeOf.set(a.uid, a.code);
      const fb = parseFaceBox((a.options as Record<string, unknown> | null)?.faceBox);
      if (fb) faceBoxOf.set(a.uid, fb);
    }
  }
  // 스냅샷(그 시점) 닉·아바타 — finale.roster. 아바타 스냅샷이 있으면 live보다 우선(과거 회차 고정).
  const snapNick = new Map(finale.roster.map((r) => [r.userId, r.nickname]));
  // 전투 재생·포디움은 그 회차 스냅샷 아바타(finale.roster.avatar) 우선 — 현재 아바타 변경과 무관히
  // 당시 모습 고정. 트로피는 finale.trophyAvatar로만 분리 저장되므로 roster.avatar는 깨끗한 스냅샷.
  for (const r of finale.roster) if (r.avatar) avatarOf.set(r.userId, r.avatar);

  const dft = (i: number) =>
    i % 2 === 0 ? '/sprites/default/male/south.png' : '/sprites/default/female/south.png';

  // 공격 성공(킬)·방어 성공(피격 후 생존) — 리플레이와 동일 소스(finale.events)로 집계.
  //  (윈도 절단된 초대규모 배틀은 윈도 내 기준 — 리플레이에 보이는 것과 일치.)
  const kills = new Map<string, number>();
  const survives = new Map<string, number>();
  for (const [a, t, , hpAfter] of finale.events) {
    if (hpAfter <= 0) {
      const au = finale.roster[a]?.userId;
      if (au) kills.set(au, (kills.get(au) ?? 0) + 1);
    } else {
      const tu = finale.roster[t]?.userId;
      if (tu) survives.set(tu, (survives.get(tu) ?? 0) + 1);
    }
  }

  const topRows = await withTimeout(
    db
      .select({
        rank: meleeParticipants.finalRank,
        nickname: characters.nickname,
        code: profiles.publicCode,
        uid: meleeParticipants.userId,
      })
      .from(meleeParticipants)
      .innerJoin(profiles, eq(profiles.id, meleeParticipants.userId))
      .innerJoin(
        characters,
        and(eq(characters.userId, meleeParticipants.userId), eq(characters.serverId, battle.serverId)),
      )
      .where(and(eq(meleeParticipants.battleId, battle.id), lte(meleeParticipants.finalRank, 3)))
      .orderBy(meleeParticipants.finalRank),
    3000,
    'melee.top3',
  ).catch(() => []);
  // 길드 brief — 포디움 + 전투 재생(전 로스터)에서 닉네임 밑 길드명·문양 표시에 사용.
  const rosterGuild = rosterIds.length
    ? await getGuildBriefsByUsers(rosterIds, battle.serverId).catch(
        () => new Map<string, { emblemUrl: string | null; name: string }>(),
      )
    : new Map<string, { emblemUrl: string | null; name: string }>();
  const podium = topRows.map((r) => ({
    rank: r.rank,
    nickname: snapNick.get(r.uid) ?? r.nickname,
    publicCode: r.code ?? null,
    // 우승(rank 1)은 트로피 아바타(있으면) — 포디움/우승카드 표시 전용. 전투 재생은 rosterAvatars(원본).
    avatarUrl:
      r.rank === 1 && finale.trophyAvatar
        ? finale.trophyAvatar
        : (avatarOf.get(r.uid) ?? dft(r.rank)),
    attackSuccess: kills.get(r.uid) ?? 0,
    defenseSuccess: survives.get(r.uid) ?? 0,
    guildName: rosterGuild.get(r.uid)?.name ?? null,
    guildEmblemUrl: rosterGuild.get(r.uid)?.emblemUrl ?? null,
  }));
  // 전투 재생 — 전원 그 회차 스냅샷 아바타(현재 아바타가 아니라 당시 모습). 챔피언도 동일.
  const rosterAvatars = finale.roster.map((r, i) => avatarOf.get(r.userId) ?? dft(i));
  const rosterCodes = finale.roster.map((r) => codeOf.get(r.userId) ?? null);
  // 닉네임 밑 길드명·문양(점령전 재생과 동일). 미소속/조회실패는 null.
  const rosterGuilds = finale.roster.map((r) => {
    const g = rosterGuild.get(r.userId);
    return g ? { name: g.name, emblemUrl: g.emblemUrl } : null;
  });

  const [meRow] = await withTimeout(
    db
      .select({
        rank: meleeParticipants.finalRank,
        diamond: meleeParticipants.rewardDiamond,
        boxes: meleeParticipants.rewardBoxes,
        myEvents: meleeParticipants.myEvents,
        cp: meleeParticipants.cpSnapshot,
        nickname: characters.nickname,
        code: profiles.publicCode,
      })
      .from(meleeParticipants)
      .innerJoin(profiles, eq(profiles.id, meleeParticipants.userId))
      .innerJoin(
        characters,
        and(eq(characters.userId, meleeParticipants.userId), eq(characters.serverId, battle.serverId)),
      )
      .where(and(eq(meleeParticipants.battleId, battle.id), eq(meleeParticipants.userId, userId)))
      .limit(1),
    3000,
    'melee.me',
  ).catch(() => []);

  return {
    edition,
    participantCount: battle.participantCount,
    championNickname,
    // FINAL 카드 아바타 = 트로피(있으면)라 트로피 전용 박스 우선, 없으면 프로필 박스.
    championFaceBox: finale.trophyAvatar
      ? ((finale.trophyFaceBox as FaceBox | null) ?? null)
      : battle.championUserId
        ? faceBoxOf.get(battle.championUserId) ?? null
        : null,
    podium,
    me: meRow ? { rank: meRow.rank, diamond: Number(meRow.diamond), boxes: meRow.boxes } : null,
    myEvents: meRow?.myEvents ?? [],
    // 스냅샷 닉 우선 — 로그 필터(닉 매칭)와 일치 + 개명 무관.
    myNickname: snapNick.get(userId) ?? meRow?.nickname ?? '',
    myAvatar: avatarOf.get(userId) ?? null,
    myPublicCode: meRow?.code ?? null,
    myCp: meRow ? Number(meRow.cp) : 0,
    totalRounds: battle.totalRounds,
    finale,
    rosterAvatars,
    rosterCodes,
    rosterGuilds,
  };
}
