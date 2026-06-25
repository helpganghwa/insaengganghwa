/**
 * 1위 교체 감지 cron — 준실시간(15분). world_events(rank_leader/guild_*_1) 기록.
 *  - 유저 랭킹 5종(최고·합산강화·전투력·레이드·대난투): runRankingLeaders (첫 관측은 시드만).
 *  - 길드 전투력·점령지 1위: runGuildLeaders (피드 자체를 직전 1위 상태로 사용).
 *
 * guild-rank-achv(일일)에서 분리 — 길드 top3 업적 로깅은 일일 유지, 1위 교체만 짧은 주기로.
 * 핫패스(강화) 무변경·스냅샷 비교라 지연 ≤15분. :00 cron 혼잡 회피 7/22/37/52분 오프셋(풀러 §11).
 * 인증 = CRON_SECRET / x-vercel-cron.
 */
import { isCronAuthorized } from '@/lib/auth/cron-auth';
import { openServerIds } from '@/lib/game/server-list';
import { runRankingLeaders, runGuildLeaders } from '@/lib/game/world/event';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function GET(req: Request) {
  if (!isCronAuthorized(req)) return new Response('forbidden', { status: 403 });
  try {
    const results = [];
    for (const sid of await openServerIds()) {
      const rankLeaders = await runRankingLeaders(sid);
      const guildLeaders = await runGuildLeaders(sid);
      results.push({ serverId: sid, rankLeaders, guildLeaders });
    }
    return Response.json({ ok: true, results, kind: 'rank-leader' });
  } catch (e) {
    console.error('[rank-leader]', e);
    return Response.json({ ok: false, error: (e as Error).message, kind: 'rank-leader' }, { status: 500 });
  }
}
