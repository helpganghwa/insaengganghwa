import { redirect } from 'next/navigation';

import { getSessionUserId } from '@/lib/auth/session';
import { withTimeout } from '@/lib/db/with-timeout';
import { halloweenPhase } from '@/lib/game/halloween/config';
import { getContestBoard } from '@/lib/game/halloween/contest';
import { getCandyOverview } from '@/lib/game/halloween/candy';
import { getActiveServerId } from '@/lib/game/servers';

import { HalloweenEventClient, type HalloweenTab } from './HalloweenEventClient';

/**
 * 할로윈 강화 대회 · 사탕 — 한 페이지 두 세그먼트(순위 | 사탕). `?tab=`은 홈 배너 깊은 링크의
 * **초기** 세그먼트로만 쓰인다(전환은 클라, 무왕복). 두 데이터는 독립이라 병렬 조회(§11.4).
 */
export const dynamic = 'force-dynamic';

function parseTab(t: string | undefined): HalloweenTab {
  return t === 'candy' ? 'candy' : 'rank';
}

export default async function HalloweenEventPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const userId = await getSessionUserId();
  if (!userId) return null;
  // 시작 전(10/28 12:00 KST 이전)엔 홈으로 — 배포 직후 URL로 들어와도 빈 화면이 새지 않게(2026-09-23 점검).
  // 스테이징은 HALLOWEEN_START_ISO를 앞당겨 두므로 영향 없음.
  if (halloweenPhase() === 'before') redirect('/');
  const initial = parseTab((await searchParams).tab);
  const serverId = await getActiveServerId();
  const [candy, board] = await Promise.all([
    withTimeout(getCandyOverview(userId, serverId), 3500, 'halloween.candy').catch((e: unknown) => {
      console.warn('[halloween.page] candy overview failed', e);
      return null;
    }),
    withTimeout(getContestBoard(serverId, userId), 4000, 'halloween.board').catch((e: unknown) => {
      console.warn('[halloween.page] board failed', e);
      return null;
    }),
  ]);

  if (!candy || !board) {
    return <p className="px-4 py-10 text-center text-sm text-zinc-500">잠시 후 다시 시도해 주세요.</p>;
  }
  return <HalloweenEventClient initialTab={initial} candy={candy} board={board} />;
}
