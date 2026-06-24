'use server';

import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';

import { requireAdmin } from '@/lib/auth/require-admin';
import { db } from '@/lib/db/client';
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

/** 사고를 해결 처리(resolved=true). 같은 (kind,payment_id) 재발 시 새 알림 생성됨. */
export async function resolveAlertAction(alertId: string) {
  await requireAdmin();
  const id = parseId(alertId);
  if (id == null) return { status: 'error', code: 'BAD_ID' } as const;
  await db
    .update(paymentAlerts)
    .set({ resolved: true, resolvedAt: new Date() })
    .where(eq(paymentAlerts.id, id));
  revalidatePath('/admin/alerts');
  return { status: 'success' } as const;
}

/**
 * 자동치유 재시도 — 사고 유형에 맞는 결제 처리 재호출(멱등).
 *  PAID_NOT_GRANTED / COMPLETE_EXCEPTION → completePurchase (재지급)
 *  REFUND_RECLAIM_FAILED                 → refundPurchase  (재회수)
 * 성공 시 해당 알림 resolved 처리.
 */
export async function retryAlertAction(alertId: string) {
  await requireAdmin();
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

  if (ok) {
    await db
      .update(paymentAlerts)
      .set({ resolved: true, resolvedAt: new Date() })
      .where(eq(paymentAlerts.id, id));
  }
  revalidatePath('/admin/alerts');
  return ok ? ({ status: 'success' } as const) : ({ status: 'error', code: 'RETRY_FAILED' } as const);
}
