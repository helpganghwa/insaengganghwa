/**
 * 대난투 우승 트로피 아바타 생성 cron — MELEE §우승컵. KST 09:00~11:59(UTC 0-2) 주기 실행.
 * 미완 트로피(생성/검토/재시도)를 진행. 멱등(상태머신). 인증 = CRON_SECRET / x-vercel-cron.
 */
import { processTrophies } from '@/lib/game/melee/trophy';

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
    const r = await processTrophies();
    return Response.json({ ok: true, ...r, kind: 'melee-trophy' });
  } catch (e) {
    console.error('[melee-trophy]', e);
    return Response.json({ ok: false, error: (e as Error).message, kind: 'melee-trophy' }, { status: 500 });
  }
}
