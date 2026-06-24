import { and, desc, eq, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { iapOrders } from '@/lib/db/schema/payment';
import { characters } from '@/lib/db/schema/server';
import { kstDateString } from '@/lib/kst';

import { PaymentsClient, type OrderRow } from './PaymentsClient';

/**
 * 관리자 결제 내역 — 날짜별(KST 하루치) 조회 + 환불 가능한 건(paid) 환불 처리.
 * (admin) 레이아웃이 접근 게이트. 환불은 포트원 취소 + 재화 회수(actions.refundOrderAction).
 */
export const dynamic = 'force-dynamic';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
/** YYYY-MM-DD + 일수 → YYYY-MM-DD (KST 달력일 이동, UTC 정오 기준이라 DST/경계 안전). */
function shiftDay(date: string, delta: number): string {
  const t = Date.parse(`${date}T12:00:00Z`) + delta * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}

export default async function AdminPaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const sp = await searchParams;
  const date = sp.date && DATE_RE.test(sp.date) ? sp.date : kstDateString();

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
    // KST 달력일 기준 하루치(created_at을 서울 시각으로 변환한 날짜가 date와 같은 것).
    .where(sql`(${iapOrders.createdAt} at time zone 'Asia/Seoul')::date = ${date}::date`)
    .orderBy(desc(iapOrders.id));

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

  return (
    <PaymentsClient
      key={date}
      orders={orders}
      date={date}
      prevDate={shiftDay(date, -1)}
      nextDate={shiftDay(date, 1)}
      today={kstDateString()}
    />
  );
}
