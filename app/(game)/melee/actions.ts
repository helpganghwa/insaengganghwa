'use server';

import { getSessionUserId } from '@/lib/auth/session';
import { getActiveServerId } from '@/lib/game/servers';
import { getMeleeRanking, type MeleeRankMode, type MeleeRankRow } from '@/lib/game/melee/ranking';

/**
 * 전체 순위 조회 — 탭 전환·더보기에서 호출. 읽기 전용이라 액션 게이트(정지/점검) 불필요.
 * 서버는 조회자 기준으로만 동작(내 등수·내 길드) — 클라가 남의 시점을 요구할 수 없다.
 */
export async function meleeRankingAction(input: {
  battleId: string;
  mode: MeleeRankMode;
  afterRank?: number;
}): Promise<
  { status: 'success'; rows: MeleeRankRow[]; myRank: number | null; hasMore: boolean } | { status: 'error' }
> {
  const userId = await getSessionUserId();
  if (!userId) return { status: 'error' };
  try {
    const serverId = await getActiveServerId();
    const r = await getMeleeRanking({
      battleId: BigInt(input.battleId),
      serverId,
      viewerUserId: userId,
      mode: input.mode,
      afterRank: input.afterRank,
    });
    return { status: 'success', ...r };
  } catch (e) {
    console.error('[melee.ranking]', e);
    return { status: 'error' };
  }
}
