/**
 * 길드 랭킹 업적 cron — 전투력·점령지 랭킹 1~3위를 길드 피드에 노출. 일일(점령전 정산 이후).
 * 직전 랭크와 변동 시에만 기록(중복 방지). 인증 = CRON_SECRET / x-vercel-cron.
 */
import { isCronAuthorized } from '@/lib/auth/cron-auth';
import { openServerIds } from '@/lib/game/server-list';
import { runGuildRankAchievements } from '@/lib/game/guild/rank-achievements';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function GET(req: Request) {
  if (!isCronAuthorized(req)) return new Response('forbidden', { status: 403 });
  try {
    const results = [];
    for (const sid of await openServerIds()) {
      results.push({ serverId: sid, ...(await runGuildRankAchievements(sid)) });
    }
    return Response.json({ ok: true, results, kind: 'guild-rank-achv' });
  } catch (e) {
    console.error('[guild-rank-achv]', e);
    return Response.json({ ok: false, error: (e as Error).message, kind: 'guild-rank-achv' }, { status: 500 });
  }
}
