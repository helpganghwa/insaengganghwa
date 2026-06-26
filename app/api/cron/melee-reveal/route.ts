/**
 * 대난투 10:00 발표 cron — MELEE §7. KST 10:00 = UTC `0 1 * * *`(vercel.json).
 * 'computed' → 'revealed'(멱등) + 참가자 전원 결과 우편 + 푸시. 인증 = CRON_SECRET / x-vercel-cron.
 */
import { isCronAuthorized } from '@/lib/auth/cron-auth';
import { revealMelee } from '@/lib/game/melee/reveal';
import { openServerIds } from '@/lib/game/server-list';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(req: Request) {
  if (!isCronAuthorized(req)) return new Response('forbidden', { status: 403 });
  try {
    const results = [];
    // per-server 에러격리(감사 G1) — 한 서버 발표 실패가 뒤 서버 보상 우편 누락으로 번지지 않도록. 멱등 재시도 안전.
    for (const sid of await openServerIds()) {
      try {
        results.push({ serverId: sid, ...(await revealMelee(sid)) });
      } catch (se) {
        console.error('[melee-reveal] server', sid, se);
        results.push({ serverId: sid, error: (se as Error).message });
      }
    }
    const ok = results.every((r) => !('error' in r));
    return Response.json({ ok, results, kind: 'melee-reveal' }, { status: ok ? 200 : 500 });
  } catch (e) {
    console.error('[melee-reveal]', e);
    return Response.json({ ok: false, error: (e as Error).message, kind: 'melee-reveal' }, { status: 500 });
  }
}
