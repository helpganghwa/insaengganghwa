import { getSessionUserId } from '@/lib/auth/session';
import { getActiveServerId } from '@/lib/game/servers';
import { withTimeout } from '@/lib/db/with-timeout';
import {
  getMyMembership,
  getGuild,
  getGuildMembersRich,
  getGuildRanking,
  getMyJoinRequest,
} from '@/lib/game/guild';
import { GUILD_LEADER_HANDOVER_DAYS, GUILD_LEADER_HANDOVER_WARN_DAYS } from '@/lib/game/guild/balance';
import { kstDateString, daysSinceIso } from '@/lib/kst';

// 풀 포화 시 무한 대기 방지 — 각 쿼리 타임아웃(초과 시 쿼리 취소·풀 회수, 에러바운더리로 degrade).
const DB_GUARD_MS = 4000;

import { GuildBrowse } from './GuildBrowse';
import { GuildHome } from './GuildHome';
import { GuildMemberTabs } from './GuildMemberTabs';

export const dynamic = 'force-dynamic';

/** 미가입 첫화면 — 랭킹/찾기 탭 + 생성 FAB. */
async function browseView(userId: string, serverId: number) {
  const [ranking, myRequest] = await Promise.all([
    withTimeout(getGuildRanking(serverId), DB_GUARD_MS, 'guild.browse.ranking'),
    withTimeout(getMyJoinRequest(userId, serverId), DB_GUARD_MS, 'guild.browse.req'),
  ]);
  return (
    <GuildBrowse
      myRequestGuildId={myRequest?.toString() ?? null}
      ranking={ranking.map((g) => ({
        id: g.id.toString(),
        name: g.name,
        level: g.level,
        memberCount: g.memberCount,
        emblemUrl: g.emblemUrl,
        emblemColor: g.emblemColor,
      }))}
    />
  );
}

export default async function GuildPage() {
  const userId = await getSessionUserId();
  const serverId = await getActiveServerId();
  if (!userId) {
    return <div className="px-4 py-8 text-center text-sm text-zinc-500">로그인이 필요합니다.</div>;
  }

  const membership = await withTimeout(getMyMembership(userId, serverId), DB_GUARD_MS, 'guild.membership');

  if (!membership) return browseView(userId, serverId);

  const [guild, members, ranking] = await Promise.all([
    withTimeout(getGuild(membership.guildId), DB_GUARD_MS, 'guild.guild'),
    withTimeout(getGuildMembersRich(membership.guildId), DB_GUARD_MS, 'guild.members'),
    withTimeout(getGuildRanking(serverId), DB_GUARD_MS, 'guild.ranking'),
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
    <GuildMemberTabs
      ranking={ranking.map((g) => ({
        id: g.id.toString(),
        name: g.name,
        level: g.level,
        memberCount: g.memberCount,
        emblemUrl: g.emblemUrl,
        emblemColor: g.emblemColor,
      }))}
      home={
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
          myUserId={userId}
          myRole={membership.role}
          usedToday={usedToday}
          leaderHandover={{
            inactiveDays: leaderInactiveDays,
            warnDays: GUILD_LEADER_HANDOVER_WARN_DAYS,
            handoverDays: GUILD_LEADER_HANDOVER_DAYS,
          }}
        />
      }
    />
  );
}
