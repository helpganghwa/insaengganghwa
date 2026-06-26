/**
 * 리더보드 사전계산 cron(감사 M7) — N분마다 서버별 5개 메트릭 스냅샷 재계산·적재.
 * 무거운 전 유저 집계(특히 전투력 앱계산)를 요청 경로 밖으로 이전 → 읽기는 인덱스로 경량.
 * :00 혼잡 회피 위해 2분 오프셋(2-59/5). 인증 = CRON_SECRET / x-vercel-cron.
 */
import { isCronAuthorized } from '@/lib/auth/cron-auth';
import { openServerIds } from '@/lib/game/server-list';
import { rebuildLeaderboardSnapshot } from '@/lib/game/leaderboard/snapshot';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(req: Request) {
  if (!isCronAuthorized(req)) return new Response('forbidden', { status: 403 });
  try {
    const results = [];
    for (const sid of await openServerIds()) {
      results.push({ serverId: sid, counts: await rebuildLeaderboardSnapshot(sid) });
    }
    return Response.json({ ok: true, results, kind: 'leaderboard-snapshot' });
  } catch (e) {
    console.error('[leaderboard-snapshot]', e);
    return Response.json({ ok: false, error: (e as Error).message, kind: 'leaderboard-snapshot' }, { status: 500 });
  }
}
