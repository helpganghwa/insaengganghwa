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
  // 단계를 서로 격리한다 — 한 단계의 예외가 나머지를 건너뛰게 두면 회수가 통째로 멈춘다
  // (2026-09-11: voided 조회의 startTime 경계 오류로 크론 전체가 죽어 있었다).
  const errors: string[] = [];
  const step = async <T>(name: string, fn: () => Promise<T>): Promise<T | { error: string }> => {
    try {
      return await fn();
    } catch (e) {
      const msg = (e as Error).message;
      console.error(`[play-sync] ${name}`, e);
      errors.push(`${name}: ${msg}`);
      return { error: msg };
    }
  };
  const consume = await step('consume', retryPlayConsume);
  const voided = await step('voided', syncPlayVoided);
  const cancelled = await step('cancelled', syncPlayCancelledRecent);
  const failed = (v: unknown) => typeof v === 'object' && v !== null && 'failed' in v && (v as { failed: number }).failed > 0;
  const ok = errors.length === 0 && !failed(consume) && !failed(voided) && !failed(cancelled);
  // 하트비트에 수치를 남긴다(2026-09-12) — 종전엔 beatCron('play-sync')만 불러 detail이 null이라,
  // syncPlayVoided의 `unknown`(우리 주문과 안 붙는 취소 구매)이 어디에도 안 남았다. 그 값이 꾸준히
  // 0이 아니면 토큰 매칭이 새는 것인데 **셀 방법 자체가 없었다**. 알림을 붙이기 전에 먼저 센다.
  const n = (v: unknown, k: string) =>
    typeof v === 'object' && v !== null && k in v ? String((v as Record<string, unknown>)[k]) : '?';
  if (ok) {
    await beatCron(
      'play-sync',
      `consume=${n(consume, 'consumed')} voided=${n(voided, 'voided')} refunded=${n(voided, 'refunded')} unknown=${n(voided, 'unknown')} cancelled=${n(cancelled, 'refunded')}`,
    );
  }
  return Response.json({ ok, consume, voided, cancelled, errors, kind: 'play-sync' }, { status: ok ? 200 : 500 });
}
