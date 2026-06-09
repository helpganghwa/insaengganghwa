import { eq } from 'drizzle-orm';

import { getSessionUserId } from '@/lib/auth/session';
import { db } from '@/lib/db/client';
import { zones } from '@/lib/db/schema/guild';
import {
  getMyMembership,
  getGuild,
  getGuildMembers,
  getResidence,
  getGuildRanking,
  getMyJoinRequest,
  getJoinRequests,
} from '@/lib/game/guild';
import { kstDateString } from '@/lib/kst';

import { GuildBrowse } from './GuildBrowse';
import { GuildHome } from './GuildHome';
import { GuildMemberTabs } from './GuildMemberTabs';

export const dynamic = 'force-dynamic';

/** 미가입 첫화면 — 랭킹/찾기 탭 + 생성 FAB. */
async function browseView(userId: string) {
  const [ranking, myRequest] = await Promise.all([getGuildRanking(), getMyJoinRequest(userId)]);
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
  if (!userId) {
    return <div className="px-4 py-8 text-center text-sm text-zinc-500">로그인이 필요합니다.</div>;
  }

  const membership = await getMyMembership(userId);

  if (!membership) return browseView(userId);

  const isOfficer = membership.role === 'leader' || membership.role === 'vice';
  const [guild, members, residenceZoneId, joinRequests, ranking] = await Promise.all([
    getGuild(membership.guildId),
    getGuildMembers(membership.guildId),
    getResidence(userId),
    isOfficer ? getJoinRequests(membership.guildId) : Promise.resolve([]),
    getGuildRanking(),
  ]);

  if (!guild) {
    // 멤버십은 있으나 길드 행이 사라진 비정상 상태 — 브라우즈로.
    return browseView(userId);
  }

  let residenceName: string | null = null;
  if (residenceZoneId != null) {
    const [z] = await db
      .select({ name: zones.name })
      .from(zones)
      .where(eq(zones.id, residenceZoneId))
      .limit(1);
    residenceName = z?.name ?? null;
  }

  const usedToday =
    membership.lastDonationKstDay === kstDateString() ? membership.dailyDonationCount : 0;

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
          notice: guild.notice,
          memberCount: guild.memberCount,
          capacity: guild.capacity,
          taxPool: guild.taxPoolDiamond.toString(),
          emblemUrl: guild.emblemUrl,
          emblemColor: guild.emblemColor,
          joinPolicy: guild.joinPolicy === 'approval' ? 'approval' : 'open',
        }}
        members={members.map((m) => ({
          userId: m.userId,
          role: m.role,
          nickname: m.nickname,
          contributionPoints: Number(m.contributionPoints),
        }))}
          joinRequests={joinRequests.map((r) => ({ userId: r.userId, nickname: r.nickname }))}
          myUserId={userId}
          myRole={membership.role}
          usedToday={usedToday}
          residence={residenceName}
        />
      }
    />
  );
}
