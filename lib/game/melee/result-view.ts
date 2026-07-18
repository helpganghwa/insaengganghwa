import 'server-only';

import { and, eq, inArray, lte, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { withTimeout } from '@/lib/db/with-timeout';
import { meleeBattles, meleeParticipants, type MeleeFinale } from '@/lib/db/schema/melee';
import { profiles } from '@/lib/db/schema/profiles';
import { characters } from '@/lib/db/schema/server';
import { userProfiles } from '@/lib/db/schema/avatar';
import { parseFaceBox, type FaceBox } from '@/components/faceCrop';
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
      // 아바타는 항상 정면(south) — 8방향 미사용. 레거시 프로필 대비 첫 값 폴백.
      const url = rot.south ?? Object.values(rot)[0];
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

  const topRows = await withTimeout(
    db
      .select({
        rank: meleeParticipants.finalRank,
        nickname: characters.nickname,
        code: profiles.publicCode,
        uid: meleeParticipants.userId,
        defenseCount: meleeParticipants.defenseCount,
        // 공격 성공(킬) — finale(마지막 N라운드 윈도) 집계가 아니라 killer 기록 기반
        // 전판 정확값(내 전투 요약과 동일 기준, 2026-07-18).
        kills: sql<number>`(select count(*)::int from melee_participants mp2
          where mp2.battle_id = ${meleeParticipants.battleId} and mp2.killer_user_id = ${meleeParticipants.userId})`,
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
  // 길드 = finale 스냅샷만 신뢰(있으면 당시 길드, null=당시 미소속). **현재 길드로 폴백하지 않는다** —
  //  회차 스냅샷에 현재 길드 정보가 새는 문제 때문(스냅샷 없는 구버전 회차는 길드 미표시).
  const snapGuild = new Map<string, { name: string | null; emblemUrl: string | null }>();
  for (const r of finale.roster) {
    if (r.guildName !== undefined || r.guildEmblemUrl !== undefined) {
      snapGuild.set(r.userId, { name: r.guildName ?? null, emblemUrl: r.guildEmblemUrl ?? null });
    }
  }
  const guildFor = (uid: string): { name: string; emblemUrl: string | null } | null => {
    const sg = snapGuild.get(uid);
    return sg && sg.name ? { name: sg.name, emblemUrl: sg.emblemUrl } : null;
  };
  const podium = topRows.map((r) => ({
    rank: r.rank,
    nickname: snapNick.get(r.uid) ?? r.nickname,
    publicCode: r.code ?? null,
    // 우승(rank 1)은 트로피 아바타(있으면) — 포디움/우승카드 표시 전용. 전투 재생은 rosterAvatars(원본).
    avatarUrl:
      r.rank === 1 && finale.trophyAvatar
        ? finale.trophyAvatar
        : (avatarOf.get(r.uid) ?? dft(r.rank)),
    attackSuccess: Number(r.kills),
    // 방어 성공 = 피격 중 버텨낸 횟수 — 탈락자(2·3위)는 마지막 피격 1회 제외, 1위는 전부 인정.
    defenseSuccess: Math.max(0, r.defenseCount - (r.rank > 1 ? 1 : 0)),
    guildName: guildFor(r.uid)?.name ?? null,
    guildEmblemUrl: guildFor(r.uid)?.emblemUrl ?? null,
  }));
  // 전투 재생 — 전원 그 회차 스냅샷 아바타(현재 아바타가 아니라 당시 모습). 챔피언도 동일.
  const rosterAvatars = finale.roster.map((r, i) => avatarOf.get(r.userId) ?? dft(i));
  const rosterCodes = finale.roster.map((r) => codeOf.get(r.userId) ?? null);
  // 닉네임 밑 길드명·문양(점령전 재생과 동일). 스냅샷 우선, 미소속/조회실패는 null.
  const rosterGuilds = finale.roster.map((r) => guildFor(r.userId));

  const [meRow] = await withTimeout(
    db
      .select({
        rank: meleeParticipants.finalRank,
        diamond: meleeParticipants.rewardDiamond,
        boxes: meleeParticipants.rewardBoxes,
        myEvents: meleeParticipants.myEvents,
        cp: meleeParticipants.cpSnapshot,
        defenseCount: meleeParticipants.defenseCount,
        // 공격 성공(킬) = 나를 killer로 기록한 참가자 수 — finale(마지막 N라운드)과 달리
        // 전체 전투 기준 정확값(포디움의 finale 집계와 의미 동일, 범위만 전판).
        kills: sql<number>`(select count(*)::int from melee_participants mp2
          where mp2.battle_id = ${meleeParticipants.battleId} and mp2.killer_user_id = ${meleeParticipants.userId})`,
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
    me: meRow
      ? {
          rank: meRow.rank,
          diamond: Number(meRow.diamond),
          boxes: meRow.boxes,
          attackSuccess: Number(meRow.kills),
          // 방어 성공 = 피격 중 버텨낸 횟수 — 탈락자는 마지막 피격 1회가 탈락이므로 제외.
          defenseSuccess: Math.max(0, meRow.defenseCount - (meRow.rank > 1 ? 1 : 0)),
        }
      : null,
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
