import { notFound, redirect } from 'next/navigation';
import { getActiveServerId } from '@/lib/game/servers';
import { and, eq } from 'drizzle-orm';
import { preload } from 'react-dom';

import { getSessionUserId } from '@/lib/auth/session';
import { db } from '@/lib/db/client';
import { characters } from '@/lib/db/schema/server';
import { withTimeout, withTimeoutRetry } from '@/lib/db/with-timeout';
import { profiles } from '@/lib/db/schema/profiles';
import { raids, raidParticipants, raidRewards, raidJoinRequests } from '@/lib/db/schema/raid';
import { raidPhasesCleared, getPendingJoinRequests } from '@/lib/game/raid';
import { getGuildBriefsByUsers } from '@/lib/game/guild';
import { getBossBg, getBossSprite } from '@/lib/game/raid/boss-sprites';
import { assetUrl } from '@/lib/asset-versions';

import { settleRaid } from '@/lib/game/raid/settle';
import { RaidSessionCard, type RaidView } from '../RaidSessionCard';

export default async function RaidDetail({
  params,
  searchParams,
}: {
  params: Promise<{ raidId: string }>;
  /** c=공유코드(비참가 관전 게이트), s=참가 scope(friend|guild|invite|link — 참가 버튼용). */
  searchParams: Promise<{ c?: string; s?: string }>;
}) {
  const userId = await getSessionUserId();
  if (!userId) return null;
  const { raidId } = await params;
  // 숫자 검증 — /raid/abc 같은 비정수는 BigInt() throw로 에러 바운더리에 떨어지므로
  // 멜리(battle/[id])와 동일하게 404 처리.
  if (!/^\d+$/.test(raidId)) notFound();

  async function loadRaid() {
    const [r] = await db
      .select({
        id: raids.id,
        serverId: raids.serverId,
        bossCode: raids.bossCode,
        phase1Hp: raids.phase1Hp,
        shareCode: raids.shareCode,
        expireAt: raids.expireAt,
        status: raids.status,
        hostUserId: raids.hostUserId,
        friendShare: raids.friendShare,
        guildShare: raids.guildShare,
      })
      .from(raids)
      .where(eq(raids.id, BigInt(raidId)))
      .limit(1);
    return r;
  }

  // 콜드 hang 시 무한 대기 방지 — 3s 가드 + 1회 재시도(풀러 콜드 스파이크 흡수, 2026-07-16).
  // 재시도도 초과 시 throw → (game)/error.tsx("다시 시도").
  let raid = await withTimeoutRetry(loadRaid, 3000, 'raid.load');
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
  // ⚠ 서버 액션(settleRaidAction)이 아니라 도메인 함수 직접 호출 — 액션의 revalidatePath가
  // 렌더 중 실행돼 Next 미지원 에러를 냈다(런타임 로그 검출, 2026-07-22). cron과 동일 경로.
  if (raid.status === 'active' && raid.expireAt.getTime() <= Date.now()) {
    try {
      await withTimeout(settleRaid({ raidId: BigInt(raidId) }), 4000, 'raid.settle');
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
        nickname: characters.nickname,
        publicCode: profiles.publicCode,
      })
      .from(raidParticipants)
      .innerJoin(profiles, eq(profiles.id, raidParticipants.userId))
      .innerJoin(raids, eq(raids.id, raidParticipants.raidId))
      // leftJoin(2026-08-27) — 탈퇴자는 characters가 없어도 참가 기록은 남는다(피해 합이 페이즈 원천).
      .leftJoin(
        characters,
        and(eq(characters.userId, raidParticipants.userId), eq(characters.serverId, raids.serverId)),
      )
      .where(eq(raidParticipants.raidId, BigInt(raidId))),
    3000,
    'raid.parts',
  ).catch(() => [] as {
    userId: string;
    totalDamage: bigint;
    attacksUsed: number;
    extraAttacks: number;
    nickname: string | null;
    publicCode: string;
  }[]);

  const serverId = await getActiveServerId();
  // 참가자 길드 문양 일괄(닉네임 옆 노출용) — 실패해도 레이드는 표시.
  // 레이드의 서버 기준(감사 B5) — 관전자(활성 서버가 다를 수 있음) 기준이면 참가자 길드가
  // 안 뜨거나 동명 유저의 타 서버 길드 문양이 잘못 붙는다.
  const guildBriefs = await getGuildBriefsByUsers(parts.map((p) => p.userId), raid.serverId).catch(
    () => new Map<string, { emblemUrl: string | null; name: string }>(),
  );

  const total = parts.reduce((s, p) => s + Number(p.totalDamage), 0);
  const me = parts.find((p) => p.userId === userId) ?? null;

  // 비참가자 — 공유코드(?c=)가 맞으면 관전 모드 허용(참가/요청 버튼 노출, 횟수 차감 없음.
  // 2026-07-27 문의 #30: 구경만 해도 참가·차감되던 동선 개선). 코드 불일치/부재는 기존대로
  // 초대 랜딩으로(raidId 열거 무단 열람 방지 — shareCode가 기존 권한 토큰).
  let join: RaidView['join'] = null;
  if (!me) {
    const sp = await searchParams;
    if ((sp.c ?? '') !== raid.shareCode) redirect(`/raid-invite/${raid.shareCode}`);
    const scope =
      sp.s === 'friend' || sp.s === 'guild' || sp.s === 'invite' ? sp.s : 'link';
    // 버튼 라벨용 예상 모드 — 서버(joinOrRequestRaid)가 재검증하므로 어긋나도 요청으로 처리될 뿐.
    // invite(0146)는 초대 기록이 있으면 즉시 참여라 'free'로 본다(기록 없으면 서버가 요청 처리).
    const mode =
      scope === 'invite' ||
      (scope === 'friend' && raid.friendShare === 'free') ||
      (scope === 'guild' && raid.guildShare === 'free')
        ? ('free' as const)
        : ('approval' as const);
    const [req] = await withTimeout(
      db
        .select({ status: raidJoinRequests.status })
        .from(raidJoinRequests)
        .where(and(eq(raidJoinRequests.raidId, BigInt(raidId)), eq(raidJoinRequests.userId, userId)))
        .limit(1),
      3000,
      'raid.joinReq',
    ).catch(() => []);
    join = { scope, mode, requested: req?.status === 'pending' };
  }

  // 정산된 레이드면 내 결산 보상(미수령/수령 여부 포함) 조회.
  let myReward: RaidView['myReward'] = null;
  if (raid.status === 'settled') {
    const [rw] = await withTimeout(
      db
        .select({
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
        boxes: rw.boxes,
        claimed: rw.claimedAt != null,
      };
    }
  }

  const isHost = raid.hostUserId === userId;
  // 개설자만 — pending 참가요청(수락/거절 UI).
  const pendingRequests = isHost
    ? await getPendingJoinRequests(BigInt(raidId)).catch(() => [])
    : [];

  const view: RaidView = {
    raidId,
    bossCode: raid.bossCode,
    status: raid.status,
    expireAtIso: raid.expireAt.toISOString(),
    shareCode: raid.shareCode,
    isHost,
    pendingRequests,
    phase1Hp: Number(raid.phase1Hp),
    totalDamage: total,
    phasesCleared: raidPhasesCleared(Number(raid.phase1Hp), total),
    isParticipant: !!me,
    join,
    myAttacksUsed: me?.attacksUsed ?? 0,
    myExtraAttacks: me?.extraAttacks ?? 0,
    myReward,
    participants: parts
      .map((p) => ({
        nickname: p.nickname ?? '탈퇴한 대장장이',
        publicCode: p.publicCode,
        totalDamage: Number(p.totalDamage),
        isMe: p.userId === userId,
        guildEmblemUrl: guildBriefs.get(p.userId)?.emblemUrl ?? null,
      }))
      .sort((a, b) => b.totalDamage - a.totalDamage),
  };

  return (
    <div className="flex-1">
      <RaidSessionCard view={view} serverId={serverId} />
    </div>
  );
}
