import { getSessionUserId } from '@/lib/auth/session';
import { getActiveServerId } from '@/lib/game/servers';
import { withTimeout } from '@/lib/db/with-timeout';
import { getMyMembership, getGuildActivityLog } from '@/lib/game/guild';

import { GuildLogFeed } from '../GuildLogFeed';

export const dynamic = 'force-dynamic';

/**
 * /guild/log — 길드 활동 로그 전체(최근 100건, 말줄임 없이 전체 줄바꿈). 길드 홈 '전체 보기' 진입.
 * 레이아웃·렌더는 월드 로그 상세(/world)와 동일(풀와이드, full 모드).
 */
export default async function GuildLogPage() {
  const userId = await getSessionUserId();
  if (!userId) return null;
  const serverId = await getActiveServerId();

  const membership = await withTimeout(
    getMyMembership(userId, serverId),
    4000,
    'guild.log.membership',
  ).catch(() => null);
  if (!membership) {
    return (
      <p className="px-4 py-10 text-center text-sm text-zinc-500">길드에 소속되어 있지 않습니다.</p>
    );
  }

  const feed = await withTimeout(
    getGuildActivityLog(membership.guildId, serverId, 100),
    3000,
    'guild.log.full',
  ).catch(() => []);

  // 풀와이드 — 카드/사이드 패딩 없이 화면 폭 전체. 타이틀 없음(월드 로그와 동일).
  return (
    <div className="py-1">
      <GuildLogFeed entries={feed} full />
    </div>
  );
}
