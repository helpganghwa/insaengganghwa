/**
 * 랭킹 단일 지표 Top100 — 탭 전환 lazy 조회(감사 C 오버패칭: 초기 5탭×100행 → 초기
 * 탭 100 + 나머지 20, 전환 시 여기서 채움). 서버는 loadSharedTops 60초 인메모리 캐시를
 * 그대로 타므로 DB 추가 부하 없음. 세션 필수(페이지와 동일 — 스크래핑 방지).
 */
import { getSessionUserId } from '@/lib/auth/session';
import {
  getLeaderboardTop,
  LEADERBOARD_METRICS,
  type LeaderboardMetric,
} from '@/lib/game/leaderboard/queries';
import { getActiveServerId } from '@/lib/game/servers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const userId = await getSessionUserId();
  if (!userId) return new Response('unauthorized', { status: 401 });
  const metric = new URL(req.url).searchParams.get('metric') ?? '';
  if (!LEADERBOARD_METRICS.includes(metric as LeaderboardMetric))
    return new Response('bad request', { status: 400 });
  const serverId = await getActiveServerId();
  const top = await getLeaderboardTop(serverId, metric as LeaderboardMetric).catch(() => []);
  return Response.json({ top }, { headers: { 'cache-control': 'no-store' } });
}
