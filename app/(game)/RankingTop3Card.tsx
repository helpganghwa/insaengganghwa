import { getRankingTop, type LeaderboardMetric } from '@/lib/game/leaderboard/queries';
import { getActiveServerId } from '@/lib/game/servers';

import { RankingDeck } from './RankingDeck';

/**
 * 홈 §1 — Top 3 명예의 전당 카드(서버). 5종 metric 덱을 모두 조회해 클라이언트 캐러셀로 전달.
 * 첫 노출 타입은 서버가 고른 랜덤(initialIndex) — 표시 타입은 클라가 state로 소유(깜박임 없음).
 */
const METRICS: { metric: LeaderboardMetric; label: string }[] = [
  { metric: 'max', label: '최고 강화' },
  { metric: 'sum', label: '합산 강화' },
  { metric: 'combat', label: '전투력' },
  { metric: 'raid', label: '레이드 처치' },
  { metric: 'melee', label: '대난투 우승' },
];

export async function RankingTop3Card() {
  const decks = (
    await Promise.all(
      METRICS.map(async (m) => ({ ...m, top: await getRankingTop(m.metric, await getActiveServerId(), 3) })),
    )
  ).filter((d) => d.top.length > 0);
  if (decks.length === 0) return null;

  const initialIndex = crypto.getRandomValues(new Uint32Array(1))[0]! % decks.length;
  return <RankingDeck decks={decks} initialIndex={initialIndex} />;
}
