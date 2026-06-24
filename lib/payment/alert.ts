import 'server-only';

import { and, eq } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { paymentAlerts } from '@/lib/db/schema/payment';

/**
 * 결제 사고 알림 — PAYMENT-SAFETY.md.
 *
 * 단일 진입점. 두 싱크: (1) payment_alerts 영속 기록(항상, 중복 방지) (2) PAYMENT_ALERT_WEBHOOK_URL
 * 설정 시 Discord/Slack 즉시 푸시(best-effort). 같은 (kind, paymentId) 미해결 건은 1회만 발송.
 *
 * best-effort 원칙: 알림 실패가 결제 처리 자체를 막으면 안 된다 — 호출부는 await하되 throw 안 함.
 */
export type PaymentAlertKind =
  | 'PAID_NOT_GRANTED' // 致命: PG는 PAID인데 지급 실패(재지급도 실패)
  | 'REFUND_RECLAIM_FAILED' // 高: PG는 CANCELLED인데 회수 실패
  | 'AMOUNT_MISMATCH' // 中: 금액 위변조 의심(지급 차단됨)
  | 'WEBHOOK_VERIFY_FAILED' // 致命: 웹훅 서명 검증 실패(시크릿/설정 사고)
  | 'MINOR_LIMIT_EXCEEDED' // 高(법규): 미성년 월 한도 초과
  | 'ORPHAN_PENDING' // 中: 장시간 pending(PG도 미결제)
  | 'COMPLETE_EXCEPTION' // 高: 지급 처리 중 예외
  | 'PARTIAL_CANCELLED'; // 中: 부분취소(수동 처리 필요)

type Severity = 'critical' | 'high' | 'warn';

const SEVERITY: Record<PaymentAlertKind, Severity> = {
  PAID_NOT_GRANTED: 'critical',
  WEBHOOK_VERIFY_FAILED: 'critical',
  REFUND_RECLAIM_FAILED: 'high',
  MINOR_LIMIT_EXCEEDED: 'high',
  COMPLETE_EXCEPTION: 'high',
  AMOUNT_MISMATCH: 'warn',
  ORPHAN_PENDING: 'warn',
  PARTIAL_CANCELLED: 'warn',
};

const SEV_EMOJI: Record<Severity, string> = { critical: '🔴', high: '🟠', warn: '🟡' };

/**
 * 결제 사고 1건 기록 + 알림. 같은 (kind, paymentId) 미해결 건이 이미 있으면 조용히 스킵(중복 방지).
 * 반환: 새로 생성·발송됐으면 true.
 */
export async function raisePaymentAlert(
  kind: PaymentAlertKind,
  opts: { detail: string; paymentId?: string; orderId?: bigint },
): Promise<boolean> {
  const paymentId = opts.paymentId ?? '';
  const severity = SEVERITY[kind];

  // 콘솔에도 남긴다(Vercel 로그 보강) — 채널 실패해도 흔적은 유지.
  console.error(`[payment-alert:${severity}] ${kind} ${paymentId} — ${opts.detail}`);

  let created = false;
  try {
    // 미해결 동일 건 선조회 → 없을 때만 insert. (부분 유니크와 별개로 알림 발송 1회 보장)
    const [existing] = await db
      .select({ id: paymentAlerts.id })
      .from(paymentAlerts)
      .where(
        and(
          eq(paymentAlerts.kind, kind),
          eq(paymentAlerts.paymentId, paymentId),
          eq(paymentAlerts.resolved, false),
        ),
      )
      .limit(1);
    if (existing) return false;

    await db
      .insert(paymentAlerts)
      .values({ kind, severity, paymentId, orderId: opts.orderId, detail: opts.detail })
      .onConflictDoNothing(); // 동시 호출 레이스 — 부분 유니크가 1건만 통과.
    created = true;
  } catch (e) {
    // DB 기록 실패해도 알림 시도는 이어간다(아래 webhook). 기록 실패 자체를 콘솔에.
    console.error('[payment-alert] persist failed', e);
  }

  if (created) await notifyWebhook(kind, severity, paymentId, opts.detail);
  return created;
}

async function notifyWebhook(
  kind: PaymentAlertKind,
  severity: Severity,
  paymentId: string,
  detail: string,
): Promise<void> {
  const url = process.env.PAYMENT_ALERT_WEBHOOK_URL;
  if (!url) return;
  try {
    const content = `${SEV_EMOJI[severity]} **결제 사고 [${severity}]** \`${kind}\`${
      paymentId ? ` (\`${paymentId}\`)` : ''
    }\n${detail}`;
    await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      // Discord/Slack 모두 content 필드 수용(Slack은 text도 함께).
      body: JSON.stringify({ content, text: content }),
    });
  } catch (e) {
    console.error('[payment-alert] webhook notify failed', e);
  }
}
