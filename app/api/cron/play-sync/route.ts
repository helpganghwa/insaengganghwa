/**
 * Play 결제 사후 정합화 cron — docs/PLAYSTORE.md §3.2. 매일 KST 03:00(UTC 18:00, vercel.json).
 *  A. 미소모 paid 주문 소모 재시도(3일 자동환불 방지) B. 구글 voided purchases → 환불 회수 동기화.
 * 서비스 계정 미설정이면 no-op(출시 전 배포 안전). 인증 = CRON_SECRET / x-vercel-cron.
 */
import { isCronAuthorized } from '@/lib/auth/cron-auth';
import { beatCron } from '@/lib/cron/heartbeat';
import { retryPlayConsume, syncPlayVoided } from '@/lib/payment/play';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function GET(req: Request) {
  if (!isCronAuthorized(req)) return new Response('forbidden', { status: 403 });
  try {
    const consume = await retryPlayConsume();
    const voided = await syncPlayVoided();
    const ok = consume.failed === 0 && voided.failed === 0;
    if (ok) await beatCron('play-sync');
    return Response.json({ ok, consume, voided, kind: 'play-sync' }, { status: ok ? 200 : 500 });
  } catch (e) {
    console.error('[play-sync]', e);
    return Response.json({ ok: false, error: (e as Error).message, kind: 'play-sync' }, { status: 500 });
  }
}
