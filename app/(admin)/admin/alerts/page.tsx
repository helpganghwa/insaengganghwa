import { desc, eq } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { paymentAlerts } from '@/lib/db/schema/payment';

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

  const toRow = (a: typeof paymentAlerts.$inferSelect): AlertRow => ({
    id: a.id.toString(),
    kind: a.kind,
    severity: a.severity,
    paymentId: a.paymentId,
    orderId: a.orderId?.toString() ?? null,
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
