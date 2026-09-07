/**
 * Apple 결제 사후 정합화 cron — docs/APPSTORE.md §3.3. 매일 KST 03:10(UTC 18:10, vercel.json).
 * 최근 30일 paid Apple 주문을 재조회해 환불(revocation)된 주문을 회수한다(웹훅 유실 백스톱).
 * 키 미설정이면 no-op(출시 전 배포 안전). 인증 = CRON_SECRET / x-vercel-cron.
 */
import { isCronAuthorized } from '@/lib/auth/cron-auth';
import { beatCron } from '@/lib/cron/heartbeat';
import { syncAppleRevoked } from '@/lib/payment/apple';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function GET(req: Request) {
  if (!isCronAuthorized(req)) return new Response('forbidden', { status: 403 });
  try {
    const r = await syncAppleRevoked();
    const ok = r.failed === 0;
    if (ok) await beatCron('apple-sync');
    return Response.json({ ok, ...r, kind: 'apple-sync' }, { status: ok ? 200 : 500 });
  } catch (e) {
    console.error('[apple-sync]', e);
    return Response.json({ ok: false, error: (e as Error).message, kind: 'apple-sync' }, { status: 500 });
  }
}
