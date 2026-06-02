import { and, eq, inArray, lte } from 'drizzle-orm';

import { getSessionUserId } from '@/lib/auth/session';
import { db } from '@/lib/db/client';
import { withTimeout } from '@/lib/db/with-timeout';
import { meleeBattles, meleeParticipants } from '@/lib/db/schema/melee';
import { profiles } from '@/lib/db/schema/profiles';
import { userProfiles } from '@/lib/db/schema/avatar';
import { kstDateString, kstStartOfDay } from '@/lib/kst';
import { assetUrl } from '@/lib/asset-versions';

import { MeleeCountdown } from './MeleeCountdown';
import { MeleeResult, type MeleeResultView } from './MeleeResult';

/**
 * /melee — 대난투 (MELEE.md). 상태별:
 *  - 발표 전(status≠revealed): 콜로세움 + 카운트다운/진행중 대기(MeleeCountdown).
 *  - 발표 후(revealed): 랭킹(1·2·3) + 내 순위/보상 + 2탭(전투 리플레이 / 내 전투 리캡).
 * 결과 API는 status='revealed' 전 비공개(서버 시각 게이트).
 */
function Hero() {
  return (
    <div className="relative flex h-44 items-end justify-center overflow-hidden rounded-2xl border border-zinc-800">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={assetUrl('/sprites/hub/melee.png')}
        alt=""
        aria-hidden
        className="absolute inset-0 h-full w-full object-cover"
        style={{ imageRendering: 'pixelated' }}
      />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/85 via-black/40 to-black/10" />
      <h1 className="relative z-10 pb-3 text-xl font-extrabold text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)]">
        대난투
      </h1>
    </div>
  );
}

export default async function MeleePage() {
  const userId = await getSessionUserId();
  if (!userId) return null;
  const battleDate = kstDateString();

  const battleRows = await withTimeout(
    db
      .select({
        id: meleeBattles.id,
        status: meleeBattles.status,
        participantCount: meleeBattles.participantCount,
        totalRounds: meleeBattles.totalRounds,
        championUserId: meleeBattles.championUserId,
        finale: meleeBattles.finale,
      })
      .from(meleeBattles)
      .where(eq(meleeBattles.battleDate, battleDate))
      .limit(1),
    3000,
    'melee.battle',
  ).catch(() => []);
  const battle = battleRows[0] ?? null;

  // KST 09:00 / 09:30 타깃(UTC instant).
  const kstMid = kstStartOfDay().getTime();
  const runAtIso = new Date(kstMid + 9 * 3_600_000).toISOString();
  const revealAtIso = new Date(kstMid + 9 * 3_600_000 + 30 * 60_000).toISOString();

  if (!battle || battle.status !== 'revealed') {
    return (
      <div className="space-y-4 px-4 py-6">
        <Hero />
        <MeleeCountdown
          runAtIso={runAtIso}
          revealAtIso={revealAtIso}
          participantCount={battle?.participantCount ?? null}
        />
      </div>
    );
  }

  // ── 발표됨 — 결과 데이터 ──
  const finale = battle.finale;
  const championNickname = finale.roster.find((r) => r.rank === 1)?.nickname ?? '챔피언';

  // finale 로스터 전원 아바타(활성 프로필 정면) — 시상대 + 리플레이 애니메이션용.
  // 비-uuid(더미)·미보유는 null → 폴백 렌더. uuid만 조회(잘못된 캐스트 방지).
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const rosterIds = finale.roster.map((r) => r.userId).filter((id) => UUID_RE.test(id));
  const avatarOf = new Map<string, string>();
  if (rosterIds.length > 0) {
    const av = await withTimeout(
      db
        .select({ uid: profiles.id, rotations: userProfiles.rotations, dir: userProfiles.activeDirection })
        .from(profiles)
        .innerJoin(userProfiles, eq(userProfiles.id, profiles.activeProfileId))
        .where(inArray(profiles.id, rosterIds)),
      3000,
      'melee.avatars',
    ).catch(() => []);
    for (const a of av) {
      const rot = a.rotations as Record<string, string>;
      const url = rot.south ?? rot[a.dir];
      if (url) avatarOf.set(a.uid, url);
    }
  }
  // 1~3위 랭킹 섹션 — 참가자 행(공격/방어 횟수) + 닉 + 아바타.
  const topRows = await withTimeout(
    db
      .select({
        rank: meleeParticipants.finalRank,
        nickname: profiles.nickname,
        uid: meleeParticipants.userId,
        atk: meleeParticipants.attackCount,
        def: meleeParticipants.defenseCount,
      })
      .from(meleeParticipants)
      .innerJoin(profiles, eq(profiles.id, meleeParticipants.userId))
      .where(and(eq(meleeParticipants.battleId, battle.id), lte(meleeParticipants.finalRank, 3)))
      .orderBy(meleeParticipants.finalRank),
    3000,
    'melee.top3',
  ).catch(() => []);
  // 아바타 미보유(더미 등)는 기본 지급 아바타로 폴백(남/여 번갈아). 실유저는 항상 활성 프로필 보유.
  const dft = (i: number) =>
    i % 2 === 0 ? '/sprites/default/male/south.png' : '/sprites/default/female/south.png';
  const podium = topRows.map((r) => ({
    rank: r.rank,
    nickname: r.nickname,
    avatarUrl: avatarOf.get(r.uid) ?? dft(r.rank),
    attackCount: r.atk,
    defenseCount: r.def,
  }));
  const rosterAvatars = finale.roster.map((r, i) => avatarOf.get(r.userId) ?? dft(i));

  const [meRow] = await withTimeout(
    db
      .select({
        rank: meleeParticipants.finalRank,
        diamond: meleeParticipants.rewardDiamond,
        boxes: meleeParticipants.rewardBoxes,
        myEvents: meleeParticipants.myEvents,
        cp: meleeParticipants.cpSnapshot,
        nickname: profiles.nickname,
      })
      .from(meleeParticipants)
      .innerJoin(profiles, eq(profiles.id, meleeParticipants.userId))
      .where(and(eq(meleeParticipants.battleId, battle.id), eq(meleeParticipants.userId, userId)))
      .limit(1),
    3000,
    'melee.me',
  ).catch(() => []);

  const view: MeleeResultView = {
    participantCount: battle.participantCount,
    championNickname,
    podium,
    me: meRow
      ? { rank: meRow.rank, diamond: Number(meRow.diamond), boxes: meRow.boxes }
      : null,
    myEvents: meRow?.myEvents ?? [],
    myNickname: meRow?.nickname ?? '',
    myAvatar: avatarOf.get(userId) ?? null,
    myCp: meRow ? Number(meRow.cp) : 0,
    totalRounds: battle.totalRounds,
    finale,
    rosterAvatars,
  };

  // MeleeResult가 main을 꽉 채움(무대 고정 + 하단 내부 스크롤).
  return <MeleeResult view={view} />;
}
