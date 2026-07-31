import { getSessionUserId } from '@/lib/auth/session';
import { getActiveServerId } from '@/lib/game/servers';
import { withTimeout } from '@/lib/db/with-timeout';
import { getWorldFeed } from '@/lib/game/world/event';

import { WorldLogFeed } from '../WorldLogFeed';

export const dynamic = 'force-dynamic';

/**
 * /world — 월드 소식 전체(최근 100건, 말줄임 없이 전체 줄바꿈). 홈 상단 티커 클릭 진입.
 */
export default async function WorldPage() {
  const userId = await getSessionUserId();
  if (!userId) return null;
  const serverId = await getActiveServerId();
  const feed = await withTimeout(getWorldFeed(serverId, 100), 3000, 'world.feed').catch(() => []);

  // 풀와이드 — 카드/사이드 패딩 없이 화면 폭 전체. 타이틀 없음.
  return (
    <div className="py-1">
      <WorldLogFeed entries={feed} full />
    </div>
  );
}
