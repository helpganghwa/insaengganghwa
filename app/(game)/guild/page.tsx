import { eq } from 'drizzle-orm';

import { getSessionUserId } from '@/lib/auth/session';
import { db } from '@/lib/db/client';
import { zones } from '@/lib/db/schema/guild';
import { getMyMembership, getGuild, getGuildMembers, getResidence } from '@/lib/game/guild';
import { kstDateString } from '@/lib/kst';

import { GuildLobby } from './GuildLobby';
import { GuildHome } from './GuildHome';

export const dynamic = 'force-dynamic';

export default async function GuildPage() {
  const userId = await getSessionUserId();
  if (!userId) {
    return <div className="px-4 py-8 text-center text-sm text-zinc-500">로그인이 필요합니다.</div>;
  }

  const membership = await getMyMembership(userId);

  if (!membership) {
    return (
      <div className="px-4 py-4">
        <GuildLobby />
      </div>
    );
  }

  const [guild, members, residenceZoneId] = await Promise.all([
    getGuild(membership.guildId),
    getGuildMembers(membership.guildId),
    getResidence(userId),
  ]);

  if (!guild) {
    // 멤버십은 있으나 길드 행이 사라진 비정상 상태 — 로비로.
    return (
      <div className="px-4 py-4">
        <GuildLobby />
      </div>
    );
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
    <div className="px-4 py-4">
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
        }}
        members={members.map((m) => ({
          userId: m.userId,
          role: m.role,
          nickname: m.nickname,
          contributionPoints: Number(m.contributionPoints),
        }))}
        myUserId={userId}
        myRole={membership.role}
        usedToday={usedToday}
        residence={residenceName}
      />
    </div>
  );
}
