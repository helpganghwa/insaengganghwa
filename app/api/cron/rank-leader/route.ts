/**
 * 랭킹 1위 교체 감지 cron — 준실시간(15분). 5종 메트릭(최고·합산강화·전투력·레이드·대난투)의
 * 현재 1위를 ranking_leaders와 비교해 바뀌면 world_events(rank_leader) 기록(첫 관측은 시드만).
 *
 * guild-rank-achv(일일)에서 분리 — 길드 업적은 일일 유지, 유저 1위만 짧은 주기로. 핫패스(강화)는
 * 안 건드리고 스냅샷 비교라 지연 ≤15분. :00 cron 혼잡 회피 위해 7/22/37/52분 오프셋(풀러 포화 §11).
 * 인증 = CRON_SECRET / x-vercel-cron.
 */
import { isCronAuthorized } from '@/lib/auth/cron-auth';
import { openServerIds } from '@/lib/game/server-list';
import { runRankingLeaders } from '@/lib/game/world/event';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function GET(req: Request) {
  if (!isCronAuthorized(req)) return new Response('forbidden', { status: 403 });
  try {
    const results = [];
    for (const sid of await openServerIds()) {
      results.push({ serverId: sid, rankLeaders: await runRankingLeaders(sid) });
    }
    return Response.json({ ok: true, results, kind: 'rank-leader' });
  } catch (e) {
    console.error('[rank-leader]', e);
    return Response.json({ ok: false, error: (e as Error).message, kind: 'rank-leader' }, { status: 500 });
  }
}
