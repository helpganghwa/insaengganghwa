/**
 * 대난투 10:00 발표 cron — MELEE §7. KST 10:00 = UTC `0 1 * * *`(vercel.json).
 * 'computed' → 'revealed'(멱등) + 참가자 전원 결과 우편 + 푸시. 인증 = CRON_SECRET / x-vercel-cron.
 */
import { isCronAuthorized } from '@/lib/auth/cron-auth';
import { revealMelee } from '@/lib/game/melee/reveal';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(req: Request) {
  if (!isCronAuthorized(req)) return new Response('forbidden', { status: 403 });
  try {
    const r = await revealMelee();
    return Response.json({ ok: true, ...r, kind: 'melee-reveal' });
  } catch (e) {
    console.error('[melee-reveal]', e);
    return Response.json({ ok: false, error: (e as Error).message, kind: 'melee-reveal' }, { status: 500 });
  }
}
