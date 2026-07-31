import 'server-only';

import { and, desc, eq, gt, inArray, notInArray, or, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { raids, raidInvites, raidParticipants } from '@/lib/db/schema/raid';
import { characters } from '@/lib/db/schema/server';
import { friendLinks } from '@/lib/db/schema/friends';
import { guildMembers, guilds } from '@/lib/db/schema/guild';
import { userEquipment } from '@/lib/db/schema/equipment';
import { combatPowerFromOwned } from '@/lib/game/equipment/combat-power';
import { profilesByIds, type FriendUser } from '@/lib/game/friends';
import { RAID_MAX_PARTICIPANTS } from '@/lib/game/balance';
import { RaidError } from './open';

/**
 * 레이드 지목 초대(0146) — 개설자가 친구·길드원을 지목해 부른다.
 *
 * 정책(2026-07-31 확정):
 *  · 대상 = 친구 + 같은 길드원(관계가 있는 사람만 — 스팸이 구조적으로 막힌다)
 *  · 권한 = 개설자만
 *  · 승인 = 불필요(초대가 곧 참여 허가). 단 **정원 10명 마감은 별개**로 적용
 *  · 인원 = 무제한(남은 자리 1석에 여럿 초대 → 선착순 운용 허용)
 *  · 중복 = 차단(raid_invite_uq) — 팝업에 '초대함' 표시
 */

export type InviteCandidate = FriendUser & {
  /** 이미 이 레이드에 참여 중인가(초대 불가). */
  joined: boolean;
  /** 이미 초대했는가(중복 차단 — '초대함' 표시). */
  invited: boolean;
  /** 전투력(BALANCE §3) — 누구를 부를지 판단하는 1차 지표. */
  combat: number;
  /** 최고 강화 · 합산 강화 — 길드원 목록과 같은 지표 세트. */
  maxEnhance: number;
  totalEnhance: number;
  /** 길드명(미소속이면 null) — 통합 목록에서 소속을 한눈에. */
  guildName: string | null;
};

/**
 * 초대 후보 목록 — 친구 탭 / 길드원 탭.
 * 자기 자신과 이미 참여한 사람도 반환하되 `joined`로 표시한다(목록에서 지우면
 * "왜 안 보이지?"가 되므로 상태로 보여준다). 자신은 호출부에서 제외.
 */
export async function getInviteCandidates(
  hostUserId: string,
  serverId: number,
  raidId: bigint,
): Promise<{ friends: InviteCandidate[]; guildMates: InviteCandidate[] }> {
  // 친구 id — friend_links는 (a,b) 양방향 저장이 아니므로 양쪽 컬럼 모두 조회.
  const linkRows = await db
    .select({ requesterId: friendLinks.requesterId, addresseeId: friendLinks.addresseeId })
    .from(friendLinks)
    .where(
      and(
        eq(friendLinks.serverId, serverId),
        eq(friendLinks.status, 'accepted'),
        or(eq(friendLinks.requesterId, hostUserId), eq(friendLinks.addresseeId, hostUserId)),
      ),
    );
  const friendIds = [
    ...new Set(
      linkRows
        .map((r) => (r.requesterId === hostUserId ? r.addresseeId : r.requesterId))
        .filter((id) => id !== hostUserId),
    ),
  ];

  // 같은 길드원 id(자신 제외). 길드 미가입이면 빈 배열.
  const [myGuild] = await db
    .select({ guildId: guildMembers.guildId })
    .from(guildMembers)
    .where(and(eq(guildMembers.userId, hostUserId), eq(guildMembers.serverId, serverId)))
    .limit(1);
  const guildIds: string[] = [];
  if (myGuild) {
    const rows = await db
      .select({ userId: guildMembers.userId })
      .from(guildMembers)
      .where(and(eq(guildMembers.guildId, myGuild.guildId), eq(guildMembers.serverId, serverId)));
    for (const r of rows) if (r.userId !== hostUserId) guildIds.push(r.userId);
  }

  const allIds = [...new Set([...friendIds, ...guildIds])];
  if (allIds.length === 0) return { friends: [], guildMates: [] };

  // 프로필·참여·초대·전투지표·길드를 한 번에(요청당 왕복 최소화 — CLAUDE §11.4).
  const [people, joined, invited, eqRows, guildRows] = await Promise.all([
    profilesByIds(allIds, serverId),
    db
      .select({ userId: raidParticipants.userId })
      .from(raidParticipants)
      .where(eq(raidParticipants.raidId, raidId)),
    db
      .select({ userId: raidInvites.inviteeUserId })
      .from(raidInvites)
      .where(eq(raidInvites.raidId, raidId)),
    db
      .select({
        uid: userEquipment.userId,
        cid: userEquipment.catalogItemId,
        el: userEquipment.enhanceLevel,
        tl: userEquipment.transcendLevel,
      })
      .from(userEquipment)
      .where(and(eq(userEquipment.serverId, serverId), inArray(userEquipment.userId, allIds))),
    db
      .select({ userId: guildMembers.userId, guildName: guilds.name })
      .from(guildMembers)
      .innerJoin(guilds, eq(guilds.id, guildMembers.guildId))
      .where(and(eq(guildMembers.serverId, serverId), inArray(guildMembers.userId, allIds))),
  ]);
  const joinedSet = new Set(joined.map((r) => r.userId));
  const invitedSet = new Set(invited.map((r) => r.userId));
  const guildByUser = new Map(guildRows.map((r) => [r.userId, r.guildName]));
  const owned = new Map<string, { catalogItemId: number; enhanceLevel: number; transcendLevel: number }[]>();
  for (const r of eqRows) {
    (owned.get(r.uid) ?? owned.set(r.uid, []).get(r.uid)!).push({
      catalogItemId: r.cid,
      enhanceLevel: r.el,
      transcendLevel: r.tl,
    });
  }
  const byId = new Map(
    people.map((p) => {
      const own = owned.get(p.userId) ?? [];
      return [
        p.userId,
        {
          ...p,
          joined: joinedSet.has(p.userId),
          invited: invitedSet.has(p.userId),
          combat: combatPowerFromOwned(own),
          maxEnhance: own.reduce((mx, o) => Math.max(mx, o.enhanceLevel), 0),
          totalEnhance: own.reduce((n, o) => n + o.enhanceLevel, 0),
          guildName: guildByUser.get(p.userId) ?? null,
        } satisfies InviteCandidate,
      ];
    }),
  );

  // 정렬 — 접속 최신순(기록 없으면 뒤). 초대 가능한 사람이 위로 오도록 joined는 뒤로.
  const pick = (ids: string[]) =>
    ids
      .map((id) => byId.get(id))
      .filter((c): c is InviteCandidate => !!c)
      .sort(
        (a, b) =>
          Number(a.joined) - Number(b.joined) ||
          (b.lastSeenAt ? Date.parse(b.lastSeenAt) : 0) -
            (a.lastSeenAt ? Date.parse(a.lastSeenAt) : 0) ||
          b.combat - a.combat,
      );

  // 길드원 탭에서는 친구와 겹치는 사람을 빼지 않는다 — 두 탭 모두에서 찾을 수 있어야 한다.
  return { friends: pick(friendIds), guildMates: pick(guildIds) };
}

/**
 * 초대 발송 — 개설자만, 대상은 친구·길드원만. 중복은 유니크 인덱스가 막는다.
 *
 * 정원(10)이 찼으면 초대를 막는다 — 레이드에는 자발적 탈퇴가 없어 한 번 차면 자리가
 * 다시 나지 않으므로, 빈자리 0에 보내는 초대는 상대가 절대 못 들어오는 헛초대가 된다
 * (2026-07-31 검토). 자리가 남아 있는 한 인원 상한은 없다 — 1석에 여럿 초대해
 * 선착순으로 채우는 운용은 그대로 허용된다.
 */
export async function inviteToRaid(input: {
  hostUserId: string;
  serverId: number;
  raidId: bigint;
  inviteeUserId: string;
}): Promise<{ ok: true; nickname: string; bossCode: string }> {
  const { hostUserId, serverId, raidId, inviteeUserId } = input;
  if (hostUserId === inviteeUserId) throw new RaidError('INVALID_TARGET');

  const [raid] = await db
    .select({
      id: raids.id,
      hostUserId: raids.hostUserId,
      serverId: raids.serverId,
      status: raids.status,
      expireAt: raids.expireAt,
      bossCode: raids.bossCode,
    })
    .from(raids)
    .where(eq(raids.id, raidId))
    .limit(1);
  if (!raid) throw new RaidError('RAID_NOT_FOUND');
  if (raid.hostUserId !== hostUserId) throw new RaidError('NOT_HOST');
  if (raid.status !== 'active' || raid.expireAt.getTime() <= Date.now()) {
    throw new RaidError('RAID_CLOSED');
  }

  // 관계 검증 — 친구이거나 같은 길드원이어야 한다(서버 권위, 클라 목록 신뢰 금지).
  const { friends, guildMates } = await getInviteCandidates(hostUserId, serverId, raidId);
  const target =
    friends.find((c) => c.userId === inviteeUserId) ??
    guildMates.find((c) => c.userId === inviteeUserId);
  if (!target) throw new RaidError('INVALID_TARGET');
  if (target.joined) throw new RaidError('ALREADY_JOINED');

  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(raidParticipants)
    .where(eq(raidParticipants.raidId, raidId));
  if (n >= RAID_MAX_PARTICIPANTS) throw new RaidError('RAID_FULL');

  try {
    await db.insert(raidInvites).values({ raidId, inviterUserId: hostUserId, inviteeUserId });
  } catch (e) {
    // 23505 = 중복 초대. 이미 보낸 것이므로 성공으로 흡수(멱등) — 화면은 '초대함'을 보인다.
    if ((e as { code?: string }).code !== '23505') throw e;
  }
  return { ok: true, nickname: target.nickname, bossCode: raid.bossCode };
}

export type ReceivedInvite = {
  raidId: string;
  shareCode: string;
  bossCode: string;
  inviterNickname: string;
  participants: number;
  /** 만료까지 남은 밀리초(서버 계산 — 클라 렌더 중 Date.now() 금지). */
  remainMs: number;
};

/**
 * 받은 초대 — 레이드 화면 하단 '초대받은 레이드' 섹션(B-2).
 * 만료·종료된 레이드와 이미 참여한 것은 제외 — 목록 필터가 곧 만료 처리다(우편 만료 로직 불필요).
 */
export async function getReceivedInvites(
  userId: string,
  serverId: number,
): Promise<ReceivedInvite[]> {
  const now = new Date();
  const rows = await db
    .select({
      raidId: raids.id,
      shareCode: raids.shareCode,
      bossCode: raids.bossCode,
      expireAt: raids.expireAt,
      inviterNickname: characters.nickname,
    })
    .from(raidInvites)
    .innerJoin(raids, eq(raids.id, raidInvites.raidId))
    .innerJoin(
      characters,
      and(
        eq(characters.userId, raidInvites.inviterUserId),
        eq(characters.serverId, raids.serverId),
      ),
    )
    .where(
      and(
        eq(raidInvites.inviteeUserId, userId),
        eq(raids.serverId, serverId),
        eq(raids.status, 'active'),
        gt(raids.expireAt, now),
        // 이미 참여했으면 제외 — 참여 후엔 일반 레이드 목록에 뜬다.
        notInArray(
          raids.id,
          db
            .select({ id: raidParticipants.raidId })
            .from(raidParticipants)
            .where(eq(raidParticipants.userId, userId)),
        ),
      ),
    )
    .orderBy(desc(raidInvites.createdAt))
    .limit(10);

  if (rows.length === 0) return [];
  const counts = await db
    .select({ raidId: raidParticipants.raidId, n: sql<number>`count(*)::int` })
    .from(raidParticipants)
    .where(
      inArray(
        raidParticipants.raidId,
        rows.map((r) => r.raidId),
      ),
    )
    .groupBy(raidParticipants.raidId);
  const countBy = new Map(counts.map((c) => [c.raidId.toString(), Number(c.n)]));

  return rows.map((r) => ({
    raidId: r.raidId.toString(),
    shareCode: r.shareCode,
    bossCode: r.bossCode,
    inviterNickname: r.inviterNickname,
    participants: countBy.get(r.raidId.toString()) ?? 0,
    remainMs: Math.max(0, r.expireAt.getTime() - now.getTime()),
  }));
}
