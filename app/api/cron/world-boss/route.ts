/**
 * 월드보스 cron(5분) — docs/WORLD-BOSS.md §1. 서버마다 ① 그날 보스 예약(없으면, 09~21시 안에서 추첨)
 * ② 출현 시각이 지난 보스 출현 ③ 떠나는 시각이 지난 보스 정산·해산. 전부 멱등이라 겹쳐 돌아도 한 번만 적용.
 * 인증 = CRON_SECRET / x-vercel-cron. 점검(cbt_ended) 게이트는 대난투와 같다.
 */
import { isCronAuthorized } from '@/lib/auth/cron-auth';
import { beatCron } from '@/lib/cron/heartbeat';
import { openServerIds } from '@/lib/game/server-list';
import { getMaintenanceState } from '@/lib/game/system-mode';
import { activateDueBosses, ensureTodayBoss, settleLeftBosses } from '@/lib/game/world-boss/spawn';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function GET(req: Request) {
  if (!isCronAuthorized(req)) return new Response('forbidden', { status: 403 });
  const mode = await getMaintenanceState().catch(() => null);
  if (mode?.active && mode.mode === 'cbt_ended') {
    await beatCron('world-boss', 'skip:cbt_ended');
    return Response.json({ ok: true, skipped: 'cbt_ended' });
  }
  const results: { serverId: number; scheduled?: string; activated?: number; settled?: number; error?: string }[] = [];
  for (const sid of await openServerIds()) {
    try {
      const s = await ensureTodayBoss(sid);
      const a = await activateDueBosses(sid);
      const l = await settleLeftBosses(sid);
      results.push({ serverId: sid, scheduled: s.created ? 'created' : (s.skipped ?? 'exists'), activated: a.length, settled: l.length });
    } catch (e) {
      console.error('[world-boss] server', sid, e);
      results.push({ serverId: sid, error: (e as Error).message });
    }
  }
  const ok = results.every((r) => !r.error);
  if (ok) await beatCron('world-boss', results.map((r) => `s${r.serverId}:${r.scheduled}/${r.activated}/${r.settled}`).join(' '));
  return Response.json({ ok, results, kind: 'world-boss' }, { status: ok ? 200 : 500 });
}
