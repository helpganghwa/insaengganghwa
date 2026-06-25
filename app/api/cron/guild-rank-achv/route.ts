/**
 * 길드 랭킹 업적 cron — 전투력·점령지 랭킹 1~3위를 길드 피드에 노출. 일일(점령전 정산 이후).
 * 직전 랭크와 변동 시에만 기록(중복 방지). 인증 = CRON_SECRET / x-vercel-cron.
 *
 * 같은 주기로 월드 피드용 1위 교체도 감지: 길드 1위(rank-achievements 내부) + 랭킹 5종 유저 1위
 * (runRankingLeaders) → world_events(rank_leader/guild_*_1).
 */
import { isCronAuthorized } from '@/lib/auth/cron-auth';
import { openServerIds } from '@/lib/game/server-list';
import { runGuildRankAchievements } from '@/lib/game/guild/rank-achievements';
import { runRankingLeaders } from '@/lib/game/world/event';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function GET(req: Request) {
  if (!isCronAuthorized(req)) return new Response('forbidden', { status: 403 });
  try {
    const results = [];
    for (const sid of await openServerIds()) {
      const guild = await runGuildRankAchievements(sid);
      const rankLeaders = await runRankingLeaders(sid);
      results.push({ serverId: sid, ...guild, rankLeaders });
    }
    return Response.json({ ok: true, results, kind: 'guild-rank-achv' });
  } catch (e) {
    console.error('[guild-rank-achv]', e);
    return Response.json({ ok: false, error: (e as Error).message, kind: 'guild-rank-achv' }, { status: 500 });
  }
}
