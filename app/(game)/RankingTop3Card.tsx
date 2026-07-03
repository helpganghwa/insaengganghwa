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

type Deck = (typeof METRICS)[number] & { top: Awaited<ReturnType<typeof getRankingTop>> };

// 서버별 60s TTL 캐시 — 홈 로드마다 5쿼리를 발사하던 핫패스 팬아웃 축소(자정 herd 완화).
// 랭킹은 준실시간이면 충분(system-mode 20s 캐시와 동일 패턴, 인스턴스 로컬).
const TTL_MS = 60_000;
const deckCache = new Map<number, { decks: Deck[]; at: number }>();

async function loadDecks(serverId: number): Promise<Deck[]> {
  const hit = deckCache.get(serverId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.decks;
  const decks = (
    await Promise.all(
      METRICS.map(async (m) => ({ ...m, top: await getRankingTop(m.metric, serverId, 3) })),
    )
  ).filter((d) => d.top.length > 0);
  deckCache.set(serverId, { decks, at: Date.now() });
  return decks;
}

export async function RankingTop3Card() {
  const serverId = await getActiveServerId();
  const decks = await loadDecks(serverId);
  if (decks.length === 0) return null;

  const initialIndex = crypto.getRandomValues(new Uint32Array(1))[0]! % decks.length;
  return <RankingDeck decks={decks} initialIndex={initialIndex} serverId={serverId} />;
}
