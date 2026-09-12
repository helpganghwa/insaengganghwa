'use server';

import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';

import { requireAdmin } from '@/lib/auth/require-admin';
import { db } from '@/lib/db/client';
import { adminActions } from '@/lib/db/schema/ops';
import { paymentAlerts } from '@/lib/db/schema/payment';
import { completePurchase } from '@/lib/payment/purchase';
import { refundPurchase } from '@/lib/payment/refund';

/** 결제 사고 알림 — PAYMENT-SAFETY.md §6 런북. 해결 처리 / 자동치유 재시도. */

function parseId(s: string): bigint | null {
  try {
    return BigInt(s);
  } catch {
    return null;
  }
}

/**
 * 운영 조치 기록(2026-09-12 전수조사) — 이 파일의 두 액션은 **재화가 움직이거나 돈 관련 경보를
 * 끄는** 조치인데 실행자가 어디에도 남지 않았다. 기록 실패가 조치를 되돌리면 안 되므로 삼킨다.
 */
async function logAdmin(
  adminUserId: string,
  action: string,
  alertId: string,
  payload: Record<string, unknown> | null,
) {
  await db
    .insert(adminActions)
    .values({ adminUserId, action, targetType: 'payment_alert', targetId: alertId, payload })
    .catch((e) => console.error('[admin] 조치 기록 실패', action, alertId, e));
}

/** 사고를 해결 처리(resolved=true). 같은 (kind,payment_id) 재발 시 새 알림 생성됨. */
export async function resolveAlertAction(alertId: string) {
  const adminUserId = await requireAdmin();
  const id = parseId(alertId);
  if (id == null) return { status: 'error', code: 'BAD_ID' } as const;
  await db
    .update(paymentAlerts)
    .set({ resolved: true, resolvedAt: new Date() })
    .where(eq(paymentAlerts.id, id));
  // 돈 관련 경보를 **누가 껐는지** 남긴다(2026-09-12) — 종전엔 알림만 조용히 사라졌다.
  await logAdmin(adminUserId, 'payment_alert.resolve', alertId, null);
  revalidatePath('/admin/alerts');
  return { status: 'success' } as const;
}

/**
 * 자동치유 재시도 — 사고 유형에 맞는 결제 처리 재호출(멱등).
 *  PAID_NOT_GRANTED / COMPLETE_EXCEPTION → completePurchase (재지급)
 *  REFUND_RECLAIM_FAILED                 → refundPurchase  (재회수)
 * 성공 시 해당 알림 resolved 처리.
 * ⚠ REFUND_CLAWBACK_SHORT는 재시도 대상이 아니다 — 기계적 실패가 아니라 "이미 소비함"이라
 *   다시 돌려도 회수액이 같고, 이미 refunded라 ok=true로 돌아와 사고가 거짓 해결된다.
 */
export async function retryAlertAction(alertId: string) {
  const adminUserId = await requireAdmin();
  const id = parseId(alertId);
  if (id == null) return { status: 'error', code: 'BAD_ID' } as const;

  const [a] = await db
    .select({ kind: paymentAlerts.kind, paymentId: paymentAlerts.paymentId })
    .from(paymentAlerts)
    .where(eq(paymentAlerts.id, id))
    .limit(1);
  if (!a) return { status: 'error', code: 'NOT_FOUND' } as const;
  if (!a.paymentId) return { status: 'error', code: 'NO_PAYMENT' } as const;

  let ok = false;
  if (a.kind === 'PAID_NOT_GRANTED' || a.kind === 'COMPLETE_EXCEPTION') {
    const r = await completePurchase(a.paymentId);
    ok = r.ok;
  } else if (a.kind === 'REFUND_RECLAIM_FAILED') {
    const r = await refundPurchase(a.paymentId);
    ok = r.ok;
  } else {
    return { status: 'error', code: 'NOT_RETRYABLE' } as const;
  }

  // 재지급·재회수는 재화가 움직이는 조치다 — 성공 여부와 무관하게 시도를 남긴다(실패한 시도도
  // "누가 언제 무엇을 건드렸나"의 일부다).
  await logAdmin(adminUserId, 'payment_alert.retry', alertId, {
    kind: a.kind,
    paymentId: a.paymentId,
    ok,
  });

  if (ok) {
    await db
      .update(paymentAlerts)
      .set({ resolved: true, resolvedAt: new Date() })
      .where(eq(paymentAlerts.id, id));
  }
  revalidatePath('/admin/alerts');
  return ok ? ({ status: 'success' } as const) : ({ status: 'error', code: 'RETRY_FAILED' } as const);
}
