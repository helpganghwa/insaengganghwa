import 'server-only';

import { and, eq, inArray, lte, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { withTimeout } from '@/lib/db/with-timeout';
import { meleeBattles, meleeParticipants, type MeleeFinale } from '@/lib/db/schema/melee';
import { profiles } from '@/lib/db/schema/profiles';
import { userProfiles } from '@/lib/db/schema/avatar';
import type { MeleeResultView } from '@/app/(game)/melee/MeleeResult';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type MeleeBattleRow = {
  id: bigint;
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
      .where(lte(meleeBattles.battleDate, battle.battleDate)),
    2000,
    'melee.edition',
  ).catch(() => [] as { n: number }[]);
  const edition = edRows[0]?.n ?? 0;

  // finale 로스터 아바타·공개코드(uuid만 조회).
  const rosterIds = finale.roster.map((r) => r.userId).filter((id) => UUID_RE.test(id));
  const avatarOf = new Map<string, string>();
  const codeOf = new Map<string, string>();
  if (rosterIds.length > 0) {
    const av = await withTimeout(
      db
        .select({
          uid: profiles.id,
          code: profiles.publicCode,
          rotations: userProfiles.rotations,
          dir: userProfiles.activeDirection,
        })
        .from(profiles)
        .innerJoin(userProfiles, eq(userProfiles.id, profiles.activeProfileId))
        .where(inArray(profiles.id, rosterIds)),
      3000,
      'melee.avatars',
    ).catch(() => []);
    for (const a of av) {
      const rot = a.rotations as Record<string, string>;
      // 유저가 설정한 방향(activeDirection) 우선 — 없으면 south 폴백.
      const url = (a.dir ? rot[a.dir] : undefined) ?? rot.south;
      if (url) avatarOf.set(a.uid, url);
      if (a.code) codeOf.set(a.uid, a.code);
    }
  }
  // 스냅샷(그 시점) 닉·아바타 — finale.roster. 아바타 스냅샷이 있으면 live보다 우선(과거 회차 고정).
  const snapNick = new Map(finale.roster.map((r) => [r.userId, r.nickname]));
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
        nickname: profiles.nickname,
        code: profiles.publicCode,
        uid: meleeParticipants.userId,
      })
      .from(meleeParticipants)
      .innerJoin(profiles, eq(profiles.id, meleeParticipants.userId))
      .where(and(eq(meleeParticipants.battleId, battle.id), lte(meleeParticipants.finalRank, 3)))
      .orderBy(meleeParticipants.finalRank),
    3000,
    'melee.top3',
  ).catch(() => []);
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
  }));
  const rosterAvatars = finale.roster.map((r, i) => avatarOf.get(r.userId) ?? dft(i));
  const rosterCodes = finale.roster.map((r) => codeOf.get(r.userId) ?? null);

  const [meRow] = await withTimeout(
    db
      .select({
        rank: meleeParticipants.finalRank,
        diamond: meleeParticipants.rewardDiamond,
        boxes: meleeParticipants.rewardBoxes,
        myEvents: meleeParticipants.myEvents,
        cp: meleeParticipants.cpSnapshot,
        nickname: profiles.nickname,
        code: profiles.publicCode,
      })
      .from(meleeParticipants)
      .innerJoin(profiles, eq(profiles.id, meleeParticipants.userId))
      .where(and(eq(meleeParticipants.battleId, battle.id), eq(meleeParticipants.userId, userId)))
      .limit(1),
    3000,
    'melee.me',
  ).catch(() => []);

  return {
    edition,
    participantCount: battle.participantCount,
    championNickname,
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
  };
}
