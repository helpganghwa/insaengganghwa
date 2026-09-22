import { desc, eq, inArray, or } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { iapOrders, paymentAlerts } from '@/lib/db/schema/payment';

import { AlertsClient, type AlertRow } from './AlertsClient';

/**
 * 관리자 결제 사고 알림 — PAYMENT-SAFETY.md. 미해결 우선 + 최근 해결분.
 * (admin) 레이아웃이 접근 게이트. 해결/재시도는 actions.ts.
 */
export const dynamic = 'force-dynamic';

export default async function AdminAlertsPage() {
  const [open, recentResolved] = await Promise.all([
    db
      .select()
      .from(paymentAlerts)
      .where(eq(paymentAlerts.resolved, false))
      .orderBy(desc(paymentAlerts.createdAt))
      .limit(200),
    db
      .select()
      .from(paymentAlerts)
      .where(eq(paymentAlerts.resolved, true))
      .orderBy(desc(paymentAlerts.resolvedAt))
      .limit(30),
  ]);

  // 어느 서버 지갑 건인지 — 경보 표에는 서버 컬럼이 없어 연결된 주문에서 읽는다(주문 id 우선, 없으면
  // 결제 id). 주문을 못 찾은 경보(서명 검증 실패 등)는 서버 표기 없이 둔다.
  const all = [...open, ...recentResolved];
  const orderIds = [...new Set(all.flatMap((a) => (a.orderId != null ? [a.orderId] : [])))];
  const paymentIds = [...new Set(all.flatMap((a) => (a.paymentId ? [a.paymentId] : [])))];
  const orderRows =
    orderIds.length + paymentIds.length === 0
      ? []
      : await db
          .select({ id: iapOrders.id, portoneOrderId: iapOrders.portoneOrderId, serverId: iapOrders.serverId })
          .from(iapOrders)
          .where(
            or(
              orderIds.length > 0 ? inArray(iapOrders.id, orderIds) : undefined,
              paymentIds.length > 0 ? inArray(iapOrders.portoneOrderId, paymentIds) : undefined,
            ),
          )
          .catch(() => []);
  const serverByOrder = new Map(orderRows.map((o) => [o.id.toString(), o.serverId]));
  const serverByPayment = new Map(orderRows.map((o) => [o.portoneOrderId, o.serverId]));

  const toRow = (a: typeof paymentAlerts.$inferSelect): AlertRow => ({
    id: a.id.toString(),
    kind: a.kind,
    severity: a.severity,
    paymentId: a.paymentId,
    orderId: a.orderId?.toString() ?? null,
    serverId:
      (a.orderId != null ? serverByOrder.get(a.orderId.toString()) : undefined) ??
      serverByPayment.get(a.paymentId) ??
      null,
    detail: a.detail,
    resolved: a.resolved,
    createdAt: a.createdAt.toISOString(),
    resolvedAt: a.resolvedAt?.toISOString() ?? null,
  });

  return (
    <div className="mx-auto w-full max-w-[760px] space-y-5 px-4 py-6 text-zinc-100">
      <div>
        <h1 className="text-xl font-bold">🔔 결제 사고 알림</h1>
        <p className="mt-1 text-xs text-zinc-500">
          미해결 {open.length}건. 자동치유가 실패한 건은 “재시도” 또는 결제 내역에서 수동 처리.
        </p>
      </div>
      <AlertsClient open={open.map(toRow)} resolved={recentResolved.map(toRow)} />
    </div>
  );
}
