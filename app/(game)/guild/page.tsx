import { getSessionUserId } from '@/lib/auth/session';
import { getActiveServerId } from '@/lib/game/servers';
import { withTimeout, withTimeoutRetry } from '@/lib/db/with-timeout';
import {
  getMyMembership,
  getGuild,
  getGuildMembersRich,
  getGuildRankingsMulti,
  getGuildActivityLog,
  getGuildHubStatus,
  getJoinRequests,
  getMyJoinRequest,
  searchGuilds,
} from '@/lib/game/guild';
import { GUILD_LEADER_HANDOVER_DAYS, GUILD_LEADER_HANDOVER_WARN_DAYS } from '@/lib/game/guild/balance';
import { kstDateString, daysSinceIso } from '@/lib/kst';
import type { Region } from '@/lib/game/guild/region-meta';

// 풀 포화 시 무한 대기 방지 — 각 쿼리 타임아웃(초과 시 쿼리 취소·풀 회수, 에러바운더리로 degrade).
const DB_GUARD_MS = 4000;

import { GuildBrowse } from './GuildBrowse';
import { GuildHome } from './GuildHome';

export const dynamic = 'force-dynamic';

/** 미가입 첫화면 — 랭킹/찾기 탭 + 생성 FAB. */
async function browseView(userId: string, serverId: number) {
  const [rankings, defaults, myRequest] = await Promise.all([
    withTimeout(getGuildRankingsMulti(serverId), DB_GUARD_MS, 'guild.browse.ranking'),
    withTimeout(searchGuilds(serverId, ''), DB_GUARD_MS, 'guild.browse.random').catch(() => []),
    withTimeout(getMyJoinRequest(userId, serverId), DB_GUARD_MS, 'guild.browse.req'),
  ]);
  const toRow = (g: {
    id: bigint;
    name: string;
    level: number;
    memberCount: number;
    emblemUrl: string | null;
    emblemColor: string | null;
    combat: number;
    intro: string | null;
    joinPolicy: string;
    hasOpenchat: boolean;
    zones: { name: string; region: Region }[];
    leaderNickname: string | null;
  }) => ({
    id: g.id.toString(),
    name: g.name,
    level: g.level,
    memberCount: g.memberCount,
    emblemUrl: g.emblemUrl,
    emblemColor: g.emblemColor,
    combat: g.combat,
    intro: g.intro,
    joinPolicy: g.joinPolicy,
    hasOpenchat: g.hasOpenchat,
    zones: g.zones,
    leaderNickname: g.leaderNickname,
  });
  return (
    <GuildBrowse
      myRequestGuildId={myRequest?.toString() ?? null}
      rankings={{
        level: rankings.level.map(toRow),
        combat: rankings.combat.map(toRow),
        zones: rankings.zones.map(toRow),
      }}
      defaultGuilds={defaults.map(toRow)}
    />
  );
}

export default async function GuildPage() {
  const userId = await getSessionUserId();
  const serverId = await getActiveServerId();
  if (!userId) {
    return <div className="px-4 py-8 text-center text-sm text-zinc-500">로그인이 필요합니다.</div>;
  }

  // 타임아웃 = 페이지 사망 지점 — 1회 재시도(풀러 콜드 스파이크 흡수, 2026-07-16 digest 261459032).
  const membership = await withTimeoutRetry(() => getMyMembership(userId, serverId), DB_GUARD_MS, 'guild.membership');

  if (!membership) return browseView(userId, serverId);

  const isOfficerHere = membership.role === 'leader' || membership.role === 'vice';
  const [guild, members, log, hub, ranks, requests] = await Promise.all([
    withTimeoutRetry(() => getGuild(membership.guildId), DB_GUARD_MS, 'guild.guild'),
    withTimeoutRetry(() => getGuildMembersRich(membership.guildId), DB_GUARD_MS, 'guild.members'),
    // 홈은 미리보기 10건만(전체는 /guild/log 상세에서 100건). 월드 로그와 동일 패턴.
    withTimeout(getGuildActivityLog(membership.guildId, serverId, 10), DB_GUARD_MS, 'guild.log').catch(
      () => [],
    ),
    // 깃발 수치 — 보유 구역·전투력 순위·대기 신청(임원만). 실패해도 홈은 떠야 하므로 전부 폴백.
    withTimeout(getGuildHubStatus(membership.guildId, serverId), DB_GUARD_MS, 'guild.hubStatus').catch(
      () => null,
    ),
    withTimeout(getGuildRankingsMulti(serverId), DB_GUARD_MS, 'guild.ranks').catch(() => null),
    isOfficerHere
      ? withTimeout(getJoinRequests(membership.guildId), DB_GUARD_MS, 'guild.reqs').catch(() => [])
      : Promise.resolve([]),
  ]);

  if (!guild) {
    // 멤버십은 있으나 길드 행이 사라진 비정상 상태 — 브라우즈로.
    return browseView(userId, serverId);
  }

  const usedToday =
    membership.lastDonationKstDay === kstDateString() ? membership.dailyDonationCount : 0;

  // 길드장 위임 위험 — 길드장 미접속일(서버 계산, lib 헬퍼). 경고일↑이면 GuildHome이 배너 노출.
  const leaderLastSeen = members.find((m) => m.role === 'leader')?.lastSeenAt ?? null;
  const leaderInactiveDays = leaderLastSeen ? daysSinceIso(leaderLastSeen) : null;

  return (
    <div className="px-4 py-4">
      <GuildHome
        guild={{
          name: guild.name,
          level: guild.level,
          xp: Number(guild.xp),
          notice: guild.notice,
          openchatUrl: guild.openchatUrl,
          memberCount: guild.memberCount,
          capacity: guild.capacity,
          emblemUrl: guild.emblemUrl,
          emblemColor: guild.emblemColor,
        }}
        members={members}
        log={log}
        menuStats={{
          zoneCount: hub?.zoneCount ?? 0,
          powerRank:
            (ranks?.combat.findIndex((g) => g.id.toString() === membership.guildId.toString()) ??
              -1) >= 0
              ? ranks!.combat.findIndex((g) => g.id.toString() === membership.guildId.toString()) + 1
              : null,
          joinRequestCount: guild.joinPolicy === 'approval' ? requests.length : 0,
        }}
        myRole={membership.role}
        usedToday={usedToday}
        leaderHandover={{
          inactiveDays: leaderInactiveDays,
          warnDays: GUILD_LEADER_HANDOVER_WARN_DAYS,
          handoverDays: GUILD_LEADER_HANDOVER_DAYS,
        }}
      />
    </div>
  );
}
