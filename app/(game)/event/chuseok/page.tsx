import { redirect } from 'next/navigation';

import { getSessionUserId } from '@/lib/auth/session';
import { withTimeout } from '@/lib/db/with-timeout';
import { chuseokPhase } from '@/lib/game/chuseok/config';
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
  // 시작 전(9/24 00:00 KST 이전)엔 홈으로 — 배포 직후 URL로 들어와도 빈 화면이 새지 않게(2026-09-23 점검).
  // 스테이징은 CHUSEOK_START_ISO를 앞당겨 두므로 영향 없음.
  if (chuseokPhase() === 'before') redirect('/');
  const initial = parseTab((await searchParams).tab);
  const serverId = await getActiveServerId();
  const [songpyeon, board] = await Promise.all([
    withTimeout(getSongpyeonOverview(userId, serverId), 3500, 'chuseok.songpyeon').catch((e: unknown) => {
      console.warn('[chuseok.page] songpyeon overview failed', e);
      return null;
    }),
    withTimeout(getContestBoard(serverId, userId), 4000, 'chuseok.board').catch((e: unknown) => {
      console.warn('[chuseok.page] board failed', e);
      return null;
    }),
  ]);

  if (!songpyeon || !board) {
    return <p className="px-4 py-10 text-center text-sm text-zinc-500">잠시 후 다시 시도해 주세요.</p>;
  }
  return <ChuseokEventClient initialTab={initial} songpyeon={songpyeon} board={board} />;
}
