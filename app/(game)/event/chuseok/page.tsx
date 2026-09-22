import { getSessionUserId } from '@/lib/auth/session';
import { withTimeout } from '@/lib/db/with-timeout';
import { getContestBoard } from '@/lib/game/chuseok/contest';
import { getSongpyeonOverview } from '@/lib/game/chuseok/songpyeon';
import { getActiveServerId } from '@/lib/game/servers';

import { ChuseokEventClient, type ChuseokTab } from './ChuseokEventClient';

/**
 * 한가위 강화 대회 · 송편 — 한 페이지 두 세그먼트(순위 | 송편). `?tab=`은 홈 배너 깊은 링크의
 * **초기** 세그먼트로만 쓰인다(전환은 클라, 무왕복). 두 데이터는 독립이라 병렬 조회(§11.4).
 */
export const dynamic = 'force-dynamic';

function parseTab(t: string | undefined): ChuseokTab {
  return t === 'songpyeon' ? 'songpyeon' : 'rank';
}

export default async function ChuseokEventPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const userId = await getSessionUserId();
  if (!userId) return null;
  const initial = parseTab((await searchParams).tab);
  const serverId = await getActiveServerId();
  const [songpyeon, board] = await Promise.all([
    withTimeout(getSongpyeonOverview(userId, serverId), 3500, 'chuseok.songpyeon').catch(() => null),
    withTimeout(getContestBoard(serverId, userId), 4000, 'chuseok.board').catch(() => null),
  ]);

  if (!songpyeon || !board) {
    return <p className="px-4 py-10 text-center text-sm text-zinc-500">잠시 후 다시 시도해 주세요.</p>;
  }
  return <ChuseokEventClient initialTab={initial} songpyeon={songpyeon} board={board} />;
}
