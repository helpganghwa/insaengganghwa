import { and, eq, gt, inArray, isNull, ne, sql } from 'drizzle-orm';

import { getSessionUserId } from '@/lib/auth/session';
import { getActiveServerId } from '@/lib/game/servers';
import { db } from '@/lib/db/client';
import { characters } from '@/lib/db/schema/server';
import { withTimeout } from '@/lib/db/with-timeout';
import { raids, raidParticipants, raidRewards, raidDailyCounts, raidJoinRequests } from '@/lib/db/schema/raid';
import {
  RAID_BASE_ATTACKS,
  RAID_DAILY_CAP,
  RAID_MAX_CONCURRENT_PER_USER,
  RAID_MAX_PARTICIPANTS,
} from '@/lib/game/balance';
import { getFriendIds } from '@/lib/game/friends';
import { kstDateString } from '@/lib/kst';
import type { RaidBoss } from '@/lib/game/raid/bosses';

import { getReceivedInvites } from '@/lib/game/raid/invite';

import { RaidSlots, type RaidSlotCell, type FriendRaid } from './RaidSlots';

export default async function RaidPage() {
  const userId = await getSessionUserId();
  const serverId = await getActiveServerId();
  if (!userId) return null;

  // 콜드 DB 커넥션 hang 시 페이지 무한 대기 방지 — 실패 시 빈 결과로 degrade(2026-05-29).
  const _r = await withTimeout(
    Promise.all([
    db
      .select({
        id: raids.id,
        bossCode: raids.bossCode,
        expireAt: raids.expireAt,
        phasesCleared: raids.phasesCleared,
        hostUserId: raids.hostUserId,
        myAttacksUsed: raidParticipants.attacksUsed,
        myExtraAttacks: raidParticipants.extraAttacks,
      })
      .from(raidParticipants)
      .innerJoin(raids, eq(raids.id, raidParticipants.raidId))
      .where(
        and(
          eq(raidParticipants.userId, userId),
          eq(raids.serverId, serverId),
          eq(raids.status, 'active'),
        ),
      ),
    db
      .select({ c: raidDailyCounts.startedCount })
      .from(raidDailyCounts)
      .where(
        and(
          eq(raidDailyCounts.userId, userId),
          eq(raidDailyCounts.serverId, serverId),
          eq(raidDailyCounts.kstDate, kstDateString()),
        ),
      )
      .limit(1),
    // 정산 완료(status='settled')되었지만 미수령(claimed_at IS NULL)인 내 보상.
    // 홈 hub 뱃지(raid_rewards.claimed_at IS NULL 카운트)와 동일 기준 — 뱃지 1이면
    // 여기 1행 노출돼야 사용자가 진입해서 수령 가능(2026-05-31 사용자 버그 리포트).
    db
      .select({
        raidId: raidRewards.raidId,
        bossCode: raids.bossCode,
        boxes: raidRewards.boxes,
        phasesCleared: raids.phasesCleared,
      })
      .from(raidRewards)
      .innerJoin(raids, eq(raids.id, raidRewards.raidId))
      .where(
        and(
          eq(raidRewards.userId, userId),
          eq(raids.serverId, serverId),
          isNull(raidRewards.claimedAt),
        ),
      ),
    ]),
    3500,
    'raid.page',
  ).catch(() => null);
  const rows = _r?.[0] ?? [];
  const dailyRow = _r?.[1] ?? [];
  const pendingClaims = _r?.[2] ?? [];

  // 내 활성 레이드들의 전체 참가자 데미지로 순위 산출.
  // 보통 RAID_MAX_CONCURRENT_PER_USER × 평균 참가자 수라 1 쿼리 batch면 충분.
  // 활성 + 정산 대기(미수령) 레이드 모두 — 정산 대기 셀에도 내 순위 노출(2026-06-01 피드백).
  const raidIds = [...rows.map((r) => r.id), ...pendingClaims.map((p) => p.raidId)];
  const allParts = raidIds.length
    ? await withTimeout(
        db
          .select({
            raidId: raidParticipants.raidId,
            userId: raidParticipants.userId,
            totalDamage: raidParticipants.totalDamage,
          })
          .from(raidParticipants)
          .where(inArray(raidParticipants.raidId, raidIds)),
        3500,
        'raid.participants',
      ).catch(() => [] as { raidId: bigint; userId: string; totalDamage: bigint }[])
    : [];
  const partsByRaid = new Map<string, { userId: string; totalDamage: bigint }[]>();
  for (const p of allParts) {
    const key = p.raidId.toString();
    const arr = partsByRaid.get(key);
    if (arr) arr.push({ userId: p.userId, totalDamage: p.totalDamage });
    else partsByRaid.set(key, [{ userId: p.userId, totalDamage: p.totalDamage }]);
  }

  // 활성 + 정산 대기를 동일 슬롯 목록으로 통합(grow 패턴). 사용자가 슬롯 하나에서
  // 진행 중/수령 대기 상태를 한 눈에 보고 카드 클릭으로 상세 진입(2026-05-31 결정).
  const activeCells: RaidSlotCell[] = rows.map((r) => {
    const parts = partsByRaid.get(r.id.toString()) ?? [];
    parts.sort((a, b) => (a.totalDamage < b.totalDamage ? 1 : a.totalDamage > b.totalDamage ? -1 : 0));
    const myRank = Math.max(1, parts.findIndex((p) => p.userId === userId) + 1);
    return {
      kind: 'active',
      raidId: r.id.toString(),
      bossCode: r.bossCode,
      expireAtIso: r.expireAt.toISOString(),
      phasesCleared: r.phasesCleared,
      isHost: r.hostUserId === userId,
      attacksLeft: RAID_BASE_ATTACKS + r.myExtraAttacks - r.myAttacksUsed,
      myRank,
      participantCount: parts.length,
    };
  });
  const pendingCells: RaidSlotCell[] = pendingClaims.map((p) => {
    const parts = partsByRaid.get(p.raidId.toString()) ?? [];
    parts.sort((a, b) => (a.totalDamage < b.totalDamage ? 1 : a.totalDamage > b.totalDamage ? -1 : 0));
    const myRank = Math.max(1, parts.findIndex((x) => x.userId === userId) + 1);
    return {
      kind: 'pending_claim',
      raidId: p.raidId.toString(),
      bossCode: p.bossCode as RaidBoss,
      boxes: {
        weapon: p.boxes.weapon ?? 0,
        armor: p.boxes.armor ?? 0,
        accessory: p.boxes.accessory ?? 0,
      },
      phasesCleared: p.phasesCleared,
      myRank,
      participantCount: parts.length,
    };
  });
  const cells: RaidSlotCell[] = [...activeCells, ...pendingCells];
  // 합계가 슬롯 한도 초과 시(정산 안 한 채 새 레이드 개설 등) 모두 노출.
  const slotCount = Math.max(RAID_MAX_CONCURRENT_PER_USER, cells.length);

  // 내가 보낸 참가 요청(pending) — 목록에 '요청중' 배지 표시용(2026-07-27 피드백 5).
  const myPendingReqIds = new Set(
    (
      await withTimeout(
        db
          .select({ raidId: raidJoinRequests.raidId })
          .from(raidJoinRequests)
          .where(and(eq(raidJoinRequests.userId, userId), eq(raidJoinRequests.status, 'pending'))),
        3000,
        'raid.myReqs',
      ).catch(() => [])
    ).map((r) => r.raidId.toString()),
  );

  // 친구가 소환한 레이드 — 친구 공개·활성·미만료, 내가 이미 참여 중인 건 제외.
  const friendIds = await withTimeout(getFriendIds(userId, serverId), 3500, 'raid.friendIds').catch(
    () => [] as string[],
  );
  let friendRaids: FriendRaid[] = [];
  if (friendIds.length) {
    const myRaidIds = new Set(rows.map((r) => r.id.toString()));
    const fr = await withTimeout(
      db
        .select({
          id: raids.id,
          bossCode: raids.bossCode,
          shareCode: raids.shareCode,
          expireAt: raids.expireAt,
          phasesCleared: raids.phasesCleared,
          hostNickname: characters.nickname,
          friendShare: raids.friendShare,
          participantCount: sql<number>`(select count(*) from raid_participants rp where rp.raid_id = ${raids.id})::int`,
        })
        .from(raids)
        // leftJoin(2026-08-27) — 호스트가 탈퇴해도 레이드는 계속 진행된다(표시만 "탈퇴한 대장장이").
        .leftJoin(
          characters,
          and(eq(characters.userId, raids.hostUserId), eq(characters.serverId, raids.serverId)),
        )
        .where(
          and(
            eq(raids.serverId, serverId),
            eq(raids.status, 'active'),
            ne(raids.friendShare, 'off'),
            gt(raids.expireAt, sql`now()`),
            // 만석(10/10) 제외 — 레이드는 자발적 탈퇴가 없어 자리가 다시 나지 않는다.
            // 남겨두면 눌러서 RAID_FULL을 만나는 헛걸음이 된다(2026-07-31).
            sql`(select count(*) from raid_participants rp where rp.raid_id = ${raids.id}) < ${RAID_MAX_PARTICIPANTS}`,
            inArray(raids.hostUserId, friendIds),
          ),
        )
        .limit(20),
      3500,
      'raid.friendRaids',
    ).catch(() => [] as never[]);
    friendRaids = fr
      .filter((r) => !myRaidIds.has(r.id.toString()))
      .map((r) => ({
        raidId: r.id.toString(),
        bossCode: r.bossCode as RaidBoss,
        shareCode: r.shareCode,
        expireAtIso: r.expireAt.toISOString(),
        phasesCleared: r.phasesCleared,
        hostNickname: r.hostNickname ?? '탈퇴한 대장장이',
        participantCount: r.participantCount,
        requested: myPendingReqIds.has(r.id.toString()),
        via: 'friend' as const,
        free: r.friendShare === 'free',
      }));
  }

  // 길드가 소환한 레이드 — guild_share != 'off' + 호스트가 나와 같은 길드. 내 레이드 제외.
  const myRaidIds2 = new Set(rows.map((r) => r.id.toString()));
  const guildRaids: FriendRaid[] = (
    (await withTimeout(
      db.execute(sql`
        select r.id::text as id, r.boss_code as boss_code, r.share_code as share_code,
               r.expire_at as expire_at, r.phases_cleared as phases_cleared,
               coalesce(hc.nickname, '탈퇴한 대장장이') as host_nickname, r.guild_share as guild_share,
               (select count(*) from raid_participants rp where rp.raid_id = r.id)::int as participant_count
        from raids r
        join guild_members hg on hg.user_id = r.host_user_id and hg.server_id = r.server_id
        join guild_members mg on mg.guild_id = hg.guild_id and mg.user_id = ${userId}::uuid and mg.server_id = ${serverId}
        left join characters hc on hc.user_id = r.host_user_id and hc.server_id = r.server_id
        where r.server_id = ${serverId} and r.status = 'active' and r.guild_share <> 'off' and r.expire_at > now()
          and (select count(*) from raid_participants rp2 where rp2.raid_id = r.id) < ${RAID_MAX_PARTICIPANTS}
        limit 20
      `),
      3500,
      'raid.guildRaids',
    ).catch(() => [])) as unknown as {
      id: string;
      boss_code: string;
      share_code: string;
      expire_at: Date;
      phases_cleared: number;
      host_nickname: string;
      guild_share: string;
      participant_count: number;
    }[]
  )
    .filter((r) => !myRaidIds2.has(r.id))
    .map((r) => ({
      raidId: r.id,
      bossCode: r.boss_code as RaidBoss,
      shareCode: r.share_code,
      expireAtIso: new Date(r.expire_at).toISOString(),
      phasesCleared: r.phases_cleared,
      hostNickname: r.host_nickname,
      participantCount: r.participant_count,
      requested: myPendingReqIds.has(r.id),
      via: 'guild' as const,
      free: r.guild_share === 'free',
    }));

  // 받은 지목 초대(0146) — 실패해도 목록은 떠야 하므로 폴백.
  const invited = await withTimeout(
    getReceivedInvites(userId, serverId),
    2000,
    'raid.invites',
  ).catch(() => []);
  const invitedRaids: FriendRaid[] = invited.map((i) => ({
    raidId: i.raidId,
    shareCode: i.shareCode,
    bossCode: i.bossCode as RaidBoss,
    // 남은 시간은 서버 계산값(remainMs)을 절대시각으로 환산 — 카운트다운 컴포넌트가 ISO를 받는다.
    expireAtIso: new Date(Date.now() + i.remainMs).toISOString(),
    phasesCleared: 0,
    hostNickname: i.inviterNickname,
    participantCount: i.participants,
    requested: myPendingReqIds.has(i.raidId),
    via: 'invite' as const,
    free: true, // 초대는 항상 즉시 참여
  }));

  /**
   * 참여 가능한 레이드 — 초대·친구·길드를 **한 목록으로 통합**(2026-07-31 결정).
   *
   * 섹션을 나누면 같은 레이드가 여러 섹션에 중복으로 뜨고(친구이자 길드원인 개설자),
   * 더 나쁘게는 우선순위 고정이 **더 유리한 경로를 버린다**(친구=승인·길드=자유인데
   * 친구 섹션에 배치되면 승인 대기가 된다). 통합 후 같은 레이드는 1회만 노출하고,
   * 경로는 초대 > 즉시참여(free) > 승인 순으로 **유리한 쪽을 자동 선택**한다.
   */
  const rank = (r: FriendRaid) => (r.via === 'invite' ? 0 : r.free ? 1 : 2);
  const openRaids: FriendRaid[] = [];
  const bestByRaid = new Map<string, FriendRaid>();
  for (const r of [...invitedRaids, ...friendRaids, ...guildRaids]) {
    const prev = bestByRaid.get(r.raidId);
    if (!prev || rank(r) < rank(prev)) bestByRaid.set(r.raidId, r);
  }
  // 노출 순서 — 초대 먼저, 그다음 즉시참여, 그다음 승인 필요.
  for (const r of [...bestByRaid.values()].sort((a, b) => rank(a) - rank(b))) openRaids.push(r);

  return (
    <div className="px-4 py-4">
      <RaidSlots
        cells={cells}
        slots={slotCount}
        dailyUsed={dailyRow[0]?.c ?? 0}
        dailyCap={RAID_DAILY_CAP}
        openRaids={openRaids}
      />
    </div>
  );
}
