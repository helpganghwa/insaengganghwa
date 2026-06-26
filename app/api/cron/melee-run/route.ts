/**
 * 대난투 9시 산출 cron — MELEE §3. KST 09:00 = UTC `0 0 * * *`(vercel.json).
 * 로스터(강화1회+) → CP 스냅샷 → 결정론 시뮬 → 저장(status='computed', 10:00 전 비공개).
 * 멱등((server_id, battle_date) UNIQUE)·서버 루프. 인증 = CRON_SECRET / x-vercel-cron.
 */
import { isCronAuthorized } from '@/lib/auth/cron-auth';
import { runMelee } from '@/lib/game/melee/run';
import { openServerIds } from '@/lib/game/server-list';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// 대규모 산출 여유 — Fluid Compute 한도 내 최대.
export const maxDuration = 300;

export async function GET(req: Request) {
  if (!isCronAuthorized(req)) return new Response('forbidden', { status: 403 });
  try {
    const results = [];
    // per-server 에러격리(감사 G1) — 한 서버 산출 실패가 뒤 서버 미개최로 번지지 않도록. 멱등 재시도 안전.
    for (const sid of await openServerIds()) {
      try {
        results.push({ serverId: sid, ...(await runMelee(sid)) });
      } catch (se) {
        console.error('[melee-run] server', sid, se);
        results.push({ serverId: sid, error: (se as Error).message });
      }
    }
    const ok = results.every((r) => !('error' in r));
    return Response.json({ ok, results, kind: 'melee-run' }, { status: ok ? 200 : 500 });
  } catch (e) {
    console.error('[melee-run]', e);
    return Response.json({ ok: false, error: (e as Error).message, kind: 'melee-run' }, { status: 500 });
  }
}
