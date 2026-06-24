import { and, desc, eq } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { iapOrders } from '@/lib/db/schema/payment';
import { characters } from '@/lib/db/schema/server';

import { PaymentsClient, type OrderRow } from './PaymentsClient';

/**
 * 관리자 결제 내역 — 최근 결제건 조회 + 환불 가능한 건(paid) 환불 처리.
 * (admin) 레이아웃이 접근 게이트. 환불은 포트원 취소 + 재화 회수(actions.refundOrderAction).
 */
export const dynamic = 'force-dynamic';

export default async function AdminPaymentsPage() {
  const rows = await db
    .select({
      id: iapOrders.id,
      serverId: iapOrders.serverId,
      product: iapOrders.productCode,
      krw: iapOrders.amountKrw,
      diamond: iapOrders.diamondGranted,
      status: iapOrders.status,
      paidAt: iapOrders.paidAt,
      createdAt: iapOrders.createdAt,
      nickname: characters.nickname,
    })
    .from(iapOrders)
    .leftJoin(
      characters,
      and(eq(characters.userId, iapOrders.userId), eq(characters.serverId, iapOrders.serverId)),
    )
    .orderBy(desc(iapOrders.id))
    .limit(100);

  const orders: OrderRow[] = rows.map((r) => ({
    id: r.id.toString(),
    serverId: r.serverId,
    product: r.product,
    krw: Number(r.krw),
    diamond: Number(r.diamond),
    status: r.status,
    nickname: r.nickname ?? null,
    paidAt: r.paidAt ? r.paidAt.toISOString() : null,
    createdAt: r.createdAt.toISOString(),
  }));

  return <PaymentsClient orders={orders} />;
}
