import 'server-only';

import { and, eq, gt, isNotNull } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { iapOrders } from '@/lib/db/schema/payment';

import { appleConfigured, AppleApiError, getAppleTransaction } from './apple-api';
import { refundPurchase } from './refund';

/**
 * Apple 결제 사후 정합화(docs/APPSTORE.md §3.3) — cron apple-sync(매일)가 호출.
 * Apple에는 Play의 voided 목록 같은 "환불된 것만" 조회가 없고(거래 ID 기준 환불 이력 조회는 고객 단위),
 * 개발자가 환불을 일으키는 API도 없다. 그래서 최근 30일 paid 주문을 하나씩 재조회해 revocationDate가
 * 생긴 주문을 refundPurchase로 회수한다. 실시간 경로는 Server Notifications V2 웹훅(REFUND·REVOKE)이고
 * 이 cron은 웹훅 유실 백스톱이다.
 */

const LOOKBACK_MS = 30 * 24 * 3_600_000;

export async function syncAppleRevoked(limit = 200): Promise<{ scanned: number; refunded: number; missing: number; failed: number }> {
  if (!appleConfigured()) return { scanned: 0, refunded: 0, missing: 0, failed: 0 };
  const rows = await db
    .select({ id: iapOrders.id, pid: iapOrders.portoneOrderId, txn: iapOrders.appleTransactionId })
    .from(iapOrders)
    .where(
      and(
        eq(iapOrders.provider, 'apple'),
        eq(iapOrders.status, 'paid'),
        isNotNull(iapOrders.appleTransactionId),
        gt(iapOrders.paidAt, new Date(Date.now() - LOOKBACK_MS)),
      ),
    )
    .limit(limit);
  let refunded = 0;
  let missing = 0;
  let failed = 0;
  for (const r of rows) {
    if (!r.txn) continue;
    try {
      const t = await getAppleTransaction(r.txn);
      if (t.revocationDate == null) continue;
      const res = await refundPurchase(r.pid);
      if (res.ok && !res.already) refunded++;
      else if (!res.ok) {
        failed++;
        console.warn('[apple-sync] refund not applied', r.pid, res.code);
      }
    } catch (e) {
      if (e instanceof AppleApiError && e.status === 404) {
        missing++;
        continue;
      }
      failed++;
      console.error('[apple-sync] lookup failed', r.pid, e);
    }
  }
  return { scanned: rows.length, refunded, missing, failed };
}

/** 어드민·스크립트용: 주문 id로 Apple 주문 요약(환불 안내에 표시). */
export async function appleOrderSummary(
  orderId: bigint,
): Promise<{ transactionId: string | null; originalTransactionId: string | null; environment: string | null } | null> {
  const [r] = await db
    .select({
      transactionId: iapOrders.appleTransactionId,
      originalTransactionId: iapOrders.appleOriginalTransactionId,
      environment: iapOrders.appleEnvironment,
    })
    .from(iapOrders)
    .where(and(eq(iapOrders.id, orderId), eq(iapOrders.provider, 'apple')))
    .limit(1);
  return r ?? null;
}
