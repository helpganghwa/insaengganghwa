/**
 * 대난투 9시 산출 cron — MELEE §3. KST 09:00 = UTC `0 0 * * *`(vercel.json).
 * 로스터(강화1회+) → CP 스냅샷 → 결정론 시뮬 → 저장(status='computed', 10:00 전 비공개).
 * 멱등(battle_date UNIQUE). 인증 = CRON_SECRET / x-vercel-cron.
 */
import { isCronAuthorized } from '@/lib/auth/cron-auth';
import { runMelee } from '@/lib/game/melee/run';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// 대규모 산출 여유 — Fluid Compute 한도 내 최대.
export const maxDuration = 300;

export async function GET(req: Request) {
  if (!isCronAuthorized(req)) return new Response('forbidden', { status: 403 });
  try {
    const r = await runMelee();
    return Response.json({ ok: true, ...r, kind: 'melee-run' });
  } catch (e) {
    console.error('[melee-run]', e);
    return Response.json({ ok: false, error: (e as Error).message, kind: 'melee-run' }, { status: 500 });
  }
}
