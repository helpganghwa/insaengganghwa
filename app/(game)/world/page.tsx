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

  return (
    <div className="px-4 py-4">
      <h1 className="mb-3 px-1 text-base font-bold">월드 소식</h1>
      <section className="rounded-2xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
        <WorldLogFeed entries={feed} full />
      </section>
    </div>
  );
}
