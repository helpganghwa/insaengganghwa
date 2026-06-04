import { getRankingTop, type LeaderboardMetric } from '@/lib/game/leaderboard/queries';

import { RankingRotator, type RankingDeck } from './RankingRotator';

/**
 * 홈 §1 — Top 3 명예의 전당 카드. 5개 메트릭(최고/합산/전투력/레이드 처치/대난투 우승)을
 * 5초마다 로테이션(고정 순서, 첫 노출만 랜덤). 데이터 있는 메트릭만 순환.
 */
const METRICS: { metric: LeaderboardMetric; label: string }[] = [
  { metric: 'max', label: '최고 강화' },
  { metric: 'sum', label: '합산 강화' },
  { metric: 'combat', label: '전투력' },
  { metric: 'raid', label: '레이드 처치' },
  { metric: 'melee', label: '대난투 우승' },
];

export async function RankingTop3Card() {
  const decks: RankingDeck[] = (
    await Promise.all(
      METRICS.map(async (m) => ({
        metric: m.metric,
        label: m.label,
        top: await getRankingTop(m.metric, 3),
      })),
    )
  ).filter((d) => d.top.length > 0);
  if (decks.length === 0) return null;

  // 첫 노출만 랜덤(서버에서 결정 → hydration 일치). 이후 순서는 decks 고정.
  const initialIndex = crypto.getRandomValues(new Uint32Array(1))[0]! % decks.length;
  return <RankingRotator decks={decks} initialIndex={initialIndex} />;
}
