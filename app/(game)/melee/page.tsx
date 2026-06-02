import { and, eq } from 'drizzle-orm';

import { getSessionUserId } from '@/lib/auth/session';
import { db } from '@/lib/db/client';
import { withTimeout } from '@/lib/db/with-timeout';
import { meleeBattles, meleeParticipants } from '@/lib/db/schema/melee';
import { profiles } from '@/lib/db/schema/profiles';
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
  const podium = finale.roster
    .filter((r) => r.rank <= 3)
    .sort((a, b) => a.rank - b.rank)
    .map((r) => ({ rank: r.rank, nickname: r.nickname, cp: r.cp }));
  const championNickname =
    finale.roster.find((r) => r.rank === 1)?.nickname ?? '챔피언';

  const [meRow] = await withTimeout(
    db
      .select({
        rank: meleeParticipants.finalRank,
        diamond: meleeParticipants.rewardDiamond,
        boxes: meleeParticipants.rewardBoxes,
        killerUserId: meleeParticipants.killerUserId,
      })
      .from(meleeParticipants)
      .where(and(eq(meleeParticipants.battleId, battle.id), eq(meleeParticipants.userId, userId)))
      .limit(1),
    3000,
    'melee.me',
  ).catch(() => []);

  let me: MeleeResultView['me'] = null;
  let myKills: MeleeResultView['myKills'] = [];
  if (meRow) {
    let killerNickname: string | null = null;
    if (meRow.killerUserId) {
      const [k] = await db
        .select({ nick: profiles.nickname })
        .from(profiles)
        .where(eq(profiles.id, meRow.killerUserId))
        .limit(1);
      killerNickname = k?.nick ?? null;
    }
    me = {
      rank: meRow.rank,
      diamond: Number(meRow.diamond),
      boxes: meRow.boxes,
      killerNickname,
    };
    myKills = (
      await withTimeout(
        db
          .select({ rank: meleeParticipants.finalRank, nickname: profiles.nickname })
          .from(meleeParticipants)
          .innerJoin(profiles, eq(profiles.id, meleeParticipants.userId))
          .where(
            and(eq(meleeParticipants.battleId, battle.id), eq(meleeParticipants.killerUserId, userId)),
          ),
        3000,
        'melee.kills',
      ).catch(() => [])
    )
      .map((r) => ({ rank: r.rank, nickname: r.nickname }))
      .sort((a, b) => a.rank - b.rank);
  }

  const view: MeleeResultView = {
    participantCount: battle.participantCount,
    championNickname,
    podium,
    me,
    myKills,
    finale,
  };

  return (
    <div className="space-y-4 px-4 py-6">
      <Hero />
      <MeleeResult view={view} />
    </div>
  );
}
