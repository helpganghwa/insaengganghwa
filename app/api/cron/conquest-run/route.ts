/**
 * 점령전 정산 cron — GUILD §5.8⑧. KST 23:00 = UTC `0 14 * * *`(vercel.json).
 * 경합 구역(공격 배치 ≥1) 결정론 정산 → 소유권/집행관 갱신. 멱등(zone×day UNIQUE).
 * 인증 = CRON_SECRET / x-vercel-cron.
 */
import { isCronAuthorized } from '@/lib/auth/cron-auth';
import { openServerIds } from '@/lib/game/server-list';
import { runConquest } from '@/lib/game/guild/conquest/run';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(req: Request) {
  if (!isCronAuthorized(req)) return new Response('forbidden', { status: 403 });
  try {
    const results = [];
    for (const sid of await openServerIds()) results.push({ serverId: sid, ...(await runConquest(sid)) });
    const r = { results };
    return Response.json({ ok: true, ...r, kind: 'conquest-run' });
  } catch (e) {
    console.error('[conquest-run]', e);
    return Response.json({ ok: false, error: (e as Error).message, kind: 'conquest-run' }, { status: 500 });
  }
}
