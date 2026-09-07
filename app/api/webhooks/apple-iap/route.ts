import { eq } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { iapOrders } from '@/lib/db/schema/payment';
import { decodeJwsPayload, type AppleTransaction } from '@/lib/payment/apple-jws';
import { appleConfigured } from '@/lib/payment/apple-api';
import { refundPurchase } from '@/lib/payment/refund';
import { raisePaymentAlert } from '@/lib/payment/alert';

/**
 * App Store Server Notifications V2 수신 — docs/APPSTORE.md §3.3(App Store Connect에 Production/Sandbox URL 등록).
 * 본문 `{ signedPayload: <JWS> }`. 서명 검증 대신 **거래 ID로 Apple API를 재조회**해 확정하므로
 * (refundPurchase가 revocationDate를 다시 확인) 위조 페이로드는 지급·회수 어느 쪽도 못 일으킨다.
 * 처리: REFUND·REVOKE → 회수. REFUND_REVERSED → 운영 알림(수동 재지급). TEST·그 외 → 200(무시).
 * 항상 200을 돌려 Apple의 재시도 폭주를 막고, 유실은 apple-sync cron이 백스톱한다.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type NotificationPayload = {
  notificationType?: string;
  subtype?: string;
  data?: { bundleId?: string; environment?: string; signedTransactionInfo?: string };
};

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { signedPayload?: string } | null;
  const signed = body?.signedPayload;
  if (!signed || typeof signed !== 'string') return Response.json({ ok: false, error: 'no signedPayload' }, { status: 400 });
  const payload = decodeJwsPayload<NotificationPayload>(signed);
  if (!payload) return Response.json({ ok: false, error: 'malformed' }, { status: 400 });

  const type = payload.notificationType ?? '';
  if (type === 'TEST') return Response.json({ ok: true, test: true });
  if (!appleConfigured()) return Response.json({ ok: true, ignored: 'unconfigured' });

  const txn = payload.data?.signedTransactionInfo
    ? decodeJwsPayload<AppleTransaction>(payload.data.signedTransactionInfo)
    : null;
  const transactionId = txn?.transactionId;
  if (!transactionId) return Response.json({ ok: true, ignored: 'no transaction' });

  const [order] = await db
    .select({ id: iapOrders.id, pid: iapOrders.portoneOrderId, status: iapOrders.status })
    .from(iapOrders)
    .where(eq(iapOrders.appleTransactionId, transactionId))
    .limit(1);
  if (!order) return Response.json({ ok: true, ignored: 'unknown transaction' });

  try {
    if (type === 'REFUND' || type === 'REVOKE') {
      const r = await refundPurchase(order.pid);
      return Response.json({ ok: true, type, refund: r });
    }
    if (type === 'REFUND_REVERSED') {
      await raisePaymentAlert('COMPLETE_EXCEPTION', {
        paymentId: order.pid,
        orderId: order.id,
        detail: 'Apple REFUND_REVERSED — 환불이 취소됨. 회수했던 지급분을 수동 재지급 검토.',
      });
      return Response.json({ ok: true, type, alerted: true });
    }
    return Response.json({ ok: true, type, ignored: true });
  } catch (e) {
    console.error('[apple-iap webhook]', type, order.pid, e);
    return Response.json({ ok: true, type, error: (e as Error).message });
  }
}
