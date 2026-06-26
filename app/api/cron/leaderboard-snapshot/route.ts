/**
 * 리더보드 사전계산 cron(감사 M7·S3·S4) — 5분마다(2-59/5). 무거운 전 유저 집계를 요청 경로 밖으로.
 *  - 매 tick: max·sum·raid·melee(가벼움) 스냅샷.
 *  - 15분 tick(분 % 15 < 5 = :02/:17/:32/:47): combat(전투력 앱계산, 무거움) + codex_champions(아이템
 *    상위3) 추가. 무거운 두 작업의 빈도를 1/3로 낮춰 풀러 부하·연산 분산(S4).
 * :00 혼잡 회피 2분 오프셋. 인증 = CRON_SECRET / x-vercel-cron.
 */
import { isCronAuthorized } from '@/lib/auth/cron-auth';
import { openServerIds } from '@/lib/game/server-list';
import { rebuildLeaderboardSnapshot, rebuildCodexChampions } from '@/lib/game/leaderboard/snapshot';
import type { LeaderboardMetric } from '@/lib/game/leaderboard/queries';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const LIGHT: LeaderboardMetric[] = ['max', 'sum', 'raid', 'melee'];
const ALL: LeaderboardMetric[] = ['max', 'sum', 'combat', 'raid', 'melee'];

export async function GET(req: Request) {
  if (!isCronAuthorized(req)) return new Response('forbidden', { status: 403 });
  try {
    // 무거운 combat·codex는 15분마다(:02/:17/:32/:47)만. 그 외 tick은 가벼운 4메트릭.
    const heavy = new Date().getUTCMinutes() % 15 < 5;
    const metrics = heavy ? ALL : LIGHT;
    const results = [];
    for (const sid of await openServerIds()) {
      const counts = await rebuildLeaderboardSnapshot(sid, metrics);
      if (heavy) await rebuildCodexChampions(sid);
      results.push({ serverId: sid, counts });
    }
    return Response.json({ ok: true, heavy, results, kind: 'leaderboard-snapshot' });
  } catch (e) {
    console.error('[leaderboard-snapshot]', e);
    return Response.json({ ok: false, error: (e as Error).message, kind: 'leaderboard-snapshot' }, { status: 500 });
  }
}
