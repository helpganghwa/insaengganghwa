import { notFound } from 'next/navigation';
import { and, eq } from 'drizzle-orm';
import { preload } from 'react-dom';

import { getSessionUserId } from '@/lib/auth/session';
import { db } from '@/lib/db/client';
import { withTimeout } from '@/lib/db/with-timeout';
import { profiles } from '@/lib/db/schema/profiles';
import { raids, raidParticipants, raidRewards } from '@/lib/db/schema/raid';
import { raidPhasesCleared } from '@/lib/game/raid';
import { getBossBg, getBossSprite } from '@/lib/game/raid/boss-sprites';
import { assetUrl } from '@/lib/asset-versions';

import { settleRaidAction } from '../actions';
import { RaidSessionCard, type RaidView } from '../RaidSessionCard';

export default async function RaidDetail({ params }: { params: Promise<{ raidId: string }> }) {
  const userId = await getSessionUserId();
  if (!userId) return null;
  const { raidId } = await params;

  async function loadRaid() {
    const [r] = await db
      .select({
        id: raids.id,
        bossCode: raids.bossCode,
        phase1Hp: raids.phase1Hp,
        shareCode: raids.shareCode,
        expireAt: raids.expireAt,
        status: raids.status,
        hostUserId: raids.hostUserId,
      })
      .from(raids)
      .where(eq(raids.id, BigInt(raidId)))
      .limit(1);
    return r;
  }

  // 콜드 hang 시 무한 대기 방지 — 3s 가드. 초과 시 throw → (game)/error.tsx("다시 시도").
  let raid = await withTimeout(loadRaid(), 3000, 'raid.load');
  if (!raid) notFound();

  // LCP 우선 — 보스 배경 + 보스 sprite(또는 APNG) preload 시그널 주입.
  // RSC가 직렬화한 헤더에 `Link: <url>; rel=preload; as=image; fetchpriority=high`로
  // 변환되어 브라우저가 HTML 파싱 전부터 fetch 시작 → 진입 즉시 표시(첫 페인트 빨라짐).
  const bgPath = getBossBg(raid.bossCode);
  if (bgPath) {
    preload(assetUrl(bgPath), { as: 'image', fetchPriority: 'high' });
  }
  const entry = getBossSprite(raid.bossCode);
  if (entry) {
    preload(assetUrl(entry.apng ?? entry.static), { as: 'image', fetchPriority: 'high' });
  }

  // 만료된 active → lazy 정산(멱등) 후 재조회. 콜드 시 정산 tx가 hang하면 페이지가
  // 막히므로 가드 — 실패 시 settle-raid cron(*/5)이 정산을 담당하고 현재 상태로 진행.
  if (raid.status === 'active' && raid.expireAt.getTime() <= Date.now()) {
    try {
      await withTimeout(settleRaidAction(raidId), 4000, 'raid.settle');
      raid = (await withTimeout(loadRaid(), 3000, 'raid.reload'))!;
    } catch {
      // 정산 hang/실패 → cron 백업. raid는 직전 active 상태로 표시.
    }
  }

  const parts = await withTimeout(
    db
      .select({
        userId: raidParticipants.userId,
        totalDamage: raidParticipants.totalDamage,
        attacksUsed: raidParticipants.attacksUsed,
        extraAttacks: raidParticipants.extraAttacks,
        nickname: profiles.nickname,
      })
      .from(raidParticipants)
      .innerJoin(profiles, eq(profiles.id, raidParticipants.userId))
      .where(eq(raidParticipants.raidId, BigInt(raidId))),
    3000,
    'raid.parts',
  ).catch(() => [] as {
    userId: string;
    totalDamage: bigint;
    attacksUsed: number;
    extraAttacks: number;
    nickname: string;
  }[]);

  const total = parts.reduce((s, p) => s + Number(p.totalDamage), 0);
  const me = parts.find((p) => p.userId === userId) ?? null;

  // 정산된 레이드면 내 결산 보상(미수령/수령 여부 포함) 조회.
  let myReward: RaidView['myReward'] = null;
  if (raid.status === 'settled') {
    const [rw] = await withTimeout(
      db
        .select({
          baseDiamond: raidRewards.baseDiamond,
          phaseDiamond: raidRewards.phaseDiamond,
          boxes: raidRewards.boxes,
          claimedAt: raidRewards.claimedAt,
        })
        .from(raidRewards)
        .where(and(eq(raidRewards.raidId, BigInt(raidId)), eq(raidRewards.userId, userId)))
        .limit(1),
      3000,
      'raid.reward',
    ).catch(() => []);
    if (rw) {
      myReward = {
        diamond: Number(rw.baseDiamond) + Number(rw.phaseDiamond),
        boxes: rw.boxes,
        claimed: rw.claimedAt != null,
      };
    }
  }

  const view: RaidView = {
    raidId,
    bossCode: raid.bossCode,
    status: raid.status,
    expireAtIso: raid.expireAt.toISOString(),
    shareCode: raid.shareCode,
    isHost: raid.hostUserId === userId,
    phase1Hp: Number(raid.phase1Hp),
    totalDamage: total,
    phasesCleared: raidPhasesCleared(Number(raid.phase1Hp), total),
    isParticipant: !!me,
    myAttacksUsed: me?.attacksUsed ?? 0,
    myExtraAttacks: me?.extraAttacks ?? 0,
    myReward,
    participants: parts
      .map((p) => ({
        nickname: p.nickname,
        totalDamage: Number(p.totalDamage),
        isMe: p.userId === userId,
      }))
      .sort((a, b) => b.totalDamage - a.totalDamage),
  };

  return (
    <div className="flex-1">
      <RaidSessionCard view={view} />
    </div>
  );
}
