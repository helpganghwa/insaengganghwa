/**
 * Play 결제 사후 정합화 cron — docs/PLAYSTORE.md §3.2. 10분마다(vercel.json).
 *  회수가 늦을수록 환불받은 재화를 쓸 창이 열리므로 주기를 짧게 둔다. 대상이 없으면 쿼리 한 번으로 끝난다.
 *  A. 미소모 paid 주문 소모 재시도(3일 자동환불 방지)
 *  B. 구글 voided purchases(최근 30일) → 환불 회수 동기화
 *  C. 최근 48시간 paid 주문의 취소 여부 직접 확인 — voided 목록 반영 지연·누락 대비(2026-09-11).
 * 서비스 계정 미설정이면 no-op(출시 전 배포 안전). 인증 = CRON_SECRET / x-vercel-cron.
 */
import { isCronAuthorized } from '@/lib/auth/cron-auth';
import { beatCron } from '@/lib/cron/heartbeat';
import { retryPlayConsume, syncPlayCancelledRecent, syncPlayVoided } from '@/lib/payment/play';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function GET(req: Request) {
  if (!isCronAuthorized(req)) return new Response('forbidden', { status: 403 });
  try {
    const consume = await retryPlayConsume();
    const voided = await syncPlayVoided();
    const cancelled = await syncPlayCancelledRecent();
    const ok = consume.failed === 0 && voided.failed === 0 && cancelled.failed === 0;
    if (ok) await beatCron('play-sync');
    return Response.json({ ok, consume, voided, cancelled, kind: 'play-sync' }, { status: ok ? 200 : 500 });
  } catch (e) {
    console.error('[play-sync]', e);
    return Response.json({ ok: false, error: (e as Error).message, kind: 'play-sync' }, { status: 500 });
  }
}
