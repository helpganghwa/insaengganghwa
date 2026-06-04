/**
 * 대난투 10:00 발표 cron — MELEE §7. KST 10:00 = UTC `0 1 * * *`(vercel.json).
 * 'computed' → 'revealed'(멱등) + 참가자 전원 결과 우편 + 푸시. 인증 = CRON_SECRET / x-vercel-cron.
 */
import { revealMelee } from '@/lib/game/melee/reveal';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

function isAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get('authorization');
    if (auth === `Bearer ${secret}`) return true;
  }
  if (req.headers.get('x-vercel-cron')) return true;
  const ua = req.headers.get('user-agent') ?? '';
  if (ua.startsWith('vercel-cron/')) return true;
  return false;
}

export async function GET(req: Request) {
  if (!isAuthorized(req)) return new Response('forbidden', { status: 403 });
  try {
    const r = await revealMelee();
    return Response.json({ ok: true, ...r, kind: 'melee-reveal' });
  } catch (e) {
    console.error('[melee-reveal]', e);
    return Response.json({ ok: false, error: (e as Error).message, kind: 'melee-reveal' }, { status: 500 });
  }
}
