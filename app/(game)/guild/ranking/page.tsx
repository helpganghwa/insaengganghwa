import { redirect } from 'next/navigation';

import { getSessionUserId } from '@/lib/auth/session';
import { getActiveServerId } from '@/lib/game/servers';
import { withTimeout } from '@/lib/db/with-timeout';
import { getMyMembership, getGuildRanking } from '@/lib/game/guild';

import { GuildList } from '../GuildList';

const DB_GUARD_MS = 4000;
export const dynamic = 'force-dynamic';

/** 길드 랭킹 상세 — 홈 메뉴 '길드 랭킹' 타일 진입(기존 탭 대체). 서버 길드 순위. */
export default async function GuildRankingPage() {
  const userId = await getSessionUserId();
  const serverId = await getActiveServerId();
  if (!userId) {
    return <div className="px-4 py-8 text-center text-sm text-zinc-500">로그인이 필요합니다.</div>;
  }
  const membership = await withTimeout(getMyMembership(userId, serverId), DB_GUARD_MS, 'guild.ranking.membership');
  if (!membership) redirect('/guild');

  const ranking = await withTimeout(getGuildRanking(serverId), DB_GUARD_MS, 'guild.ranking.list');

  return (
    <div className="px-4 py-4">
      <h1 className="mb-3 px-1 text-sm font-bold">길드 랭킹</h1>
      <GuildList
        guilds={ranking.map((g) => ({
          id: g.id.toString(),
          name: g.name,
          level: g.level,
          memberCount: g.memberCount,
          emblemUrl: g.emblemUrl,
          emblemColor: g.emblemColor,
          combat: g.combat,
          intro: g.intro,
        }))}
        showRank
        emptyText="아직 결성된 길드가 없습니다."
      />
    </div>
  );
}
