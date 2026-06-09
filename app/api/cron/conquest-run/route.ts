/**
 * 점령전 정산 cron — GUILD §5.8⑧. KST 12:00 = UTC `0 3 * * *`(vercel.json).
 * 경합 구역(공격 배치 ≥1) 결정론 정산 → 소유권/집행관 갱신. 멱등(zone×day UNIQUE).
 * 인증 = CRON_SECRET / x-vercel-cron.
 */
import { runConquest } from '@/lib/game/guild/conquest/run';

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
    const r = await runConquest();
    return Response.json({ ok: true, ...r, kind: 'conquest-run' });
  } catch (e) {
    console.error('[conquest-run]', e);
    return Response.json({ ok: false, error: (e as Error).message, kind: 'conquest-run' }, { status: 500 });
  }
}
