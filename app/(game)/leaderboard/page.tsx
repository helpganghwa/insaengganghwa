import { getActiveServerId } from '@/lib/game/servers';
import { getSessionUserId } from '@/lib/auth/session';
import {
  getLeaderboardAllPayload,
  type LeaderboardMetric,
} from '@/lib/game/leaderboard/queries';

import { LeaderboardBoard } from './LeaderboardBoard';

function parse(t: string | undefined): LeaderboardMetric {
  return t === 'sum' || t === 'combat' || t === 'raid' || t === 'melee' ? t : 'max';
}

/**
 * 랭킹 — 5지표를 한 번에 받아 탭 전환은 클라에서(무왕복, 2026-07-31).
 * `?tab=`은 RankingDeck 등에서 오는 깊은 링크의 **초기** 탭으로만 쓰인다.
 */
export default async function LeaderboardPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const userId = await getSessionUserId();
  if (!userId) return null;
  const initial = parse((await searchParams).tab);
  const serverId = await getActiveServerId();
  // 초기 탭만 100행, 나머지 20행(감사 C) — 전환 시 /api/leaderboard/top이 패칭 완료 후 채움.
  const payloads = await getLeaderboardAllPayload(serverId, userId, initial);

  return (
    <LeaderboardBoard
      initial={initial}
      payloads={payloads}
      serverId={serverId}
      userId={userId}
    />
  );
}
