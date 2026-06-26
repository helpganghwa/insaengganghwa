/**
 * 길드장 자동 위임 cron — GUILD §4. 매일 1회(KST 12:00 = UTC `0 3 * * *`, vercel.json).
 * 길드장 7일 미접속 → 활성 후계자 승격(부길드장→기여도→가입순), 5일차 경고 우편 1회.
 * 멱등(leader_handover_warned_at 플래그 + 길드장 행 잠금)·서버 루프. 인증 = CRON_SECRET / x-vercel-cron.
 */
import { isCronAuthorized } from '@/lib/auth/cron-auth';
import { runLeaderHandover } from '@/lib/game/guild/leader-handover';
import { openServerIds } from '@/lib/game/server-list';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function GET(req: Request) {
  if (!isCronAuthorized(req)) return new Response('forbidden', { status: 403 });
  try {
    const results = [];
    // per-server 에러격리(감사 G1) — 한 서버 실패가 뒤 서버를 막지 않도록. 멱등 재시도 안전.
    for (const sid of await openServerIds()) {
      try {
        results.push({ serverId: sid, ...(await runLeaderHandover(sid)) });
      } catch (se) {
        console.error('[guild-leader-handover] server', sid, se);
        results.push({ serverId: sid, error: (se as Error).message });
      }
    }
    const ok = results.every((r) => !('error' in r));
    return Response.json({ ok, results, kind: 'guild-leader-handover' }, { status: ok ? 200 : 500 });
  } catch (e) {
    console.error('[guild-leader-handover]', e);
    return Response.json({ ok: false, error: (e as Error).message, kind: 'guild-leader-handover' }, { status: 500 });
  }
}
