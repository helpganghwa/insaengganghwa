import { and, desc, eq, ilike, inArray, or, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { iapOrders } from '@/lib/db/schema/payment';
import { battlePassSegments } from '@/lib/db/schema/battlepass';
import { characters } from '@/lib/db/schema/server';
import { profiles } from '@/lib/db/schema/profiles';
import { kstDateString } from '@/lib/kst';
import { parseBpProduct, productDisplayName } from '@/lib/payment/purchase';

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
  searchParams: Promise<{ date?: string; q?: string }>;
}) {
  const sp = await searchParams;
  const date = sp.date && DATE_RE.test(sp.date) ? sp.date : kstDateString();
  const q = sp.q?.trim() ?? '';
  const searching = q.length > 0;
  // 검색 모드: 날짜 무시, 유저코드(정확)·닉네임·거래ID(부분)로 전체 조회. 아니면 KST 하루치.
  const whereClause = searching
    ? or(
        ilike(profiles.publicCode, q),
        ilike(characters.nickname, `%${q}%`),
        ilike(iapOrders.portoneOrderId, `%${q}%`),
      )
    : sql`(${iapOrders.createdAt} at time zone 'Asia/Seoul')::date = ${date}::date`;

  const rows = await db
    .select({
      id: iapOrders.id,
      userId: iapOrders.userId,
      serverId: iapOrders.serverId,
      portoneOrderId: iapOrders.portoneOrderId,
      product: iapOrders.productCode,
      krw: iapOrders.amountKrw,
      diamond: iapOrders.diamondGranted,
      status: iapOrders.status,
      paidAt: iapOrders.paidAt,
      createdAt: iapOrders.createdAt,
      nickname: characters.nickname,
      code: profiles.publicCode,
    })
    .from(iapOrders)
    .leftJoin(
      characters,
      and(eq(characters.userId, iapOrders.userId), eq(characters.serverId, iapOrders.serverId)),
    )
    .leftJoin(profiles, eq(profiles.id, iapOrders.userId))
    .where(whereClause)
    .orderBy(desc(iapOrders.id))
    .limit(searching ? 100 : 500);

  // 배틀패스 주문의 수령 여부 — 프리미엄 보상을 하나라도 수령(claimedTiers 비지 않음)했으면 환불 불가.
  const bpUserIds = [...new Set(rows.filter((r) => r.product.startsWith('bp_')).map((r) => r.userId))];
  const claimedKeys = new Set<string>();
  if (bpUserIds.length > 0) {
    const segs = await db
      .select({
        userId: battlePassSegments.userId,
        serverId: battlePassSegments.serverId,
        passType: battlePassSegments.passType,
        segmentIndex: battlePassSegments.segmentIndex,
        tiers: battlePassSegments.premiumClaimedTiers,
      })
      .from(battlePassSegments)
      .where(inArray(battlePassSegments.userId, bpUserIds));
    for (const s of segs) {
      if (s.tiers.length > 0)
        claimedKeys.add(`${s.userId}:${s.serverId}:${s.passType}:${s.segmentIndex}`);
    }
  }

  const orders: OrderRow[] = rows.map((r) => {
    const bp = parseBpProduct(r.product);
    return {
      id: r.id.toString(),
      serverId: r.serverId,
      portoneOrderId: r.portoneOrderId,
      product: r.product,
      productName: productDisplayName(r.product),
      krw: Number(r.krw),
      diamond: Number(r.diamond),
      status: r.status,
      nickname: r.nickname ?? null,
      code: r.code ?? null,
      paidAt: r.paidAt ? r.paidAt.toISOString() : null,
      createdAt: r.createdAt.toISOString(),
      bp: bp != null,
      // 배틀패스: 프리미엄 수령했으면 환불 불가(true). 비-배틀패스는 false.
      bpClaimed: bp != null && claimedKeys.has(`${r.userId}:${r.serverId}:${bp.type}:${bp.segmentIndex}`),
    };
  });

  return (
    <PaymentsClient
      key={searching ? `q:${q}` : date}
      orders={orders}
      date={date}
      prevDate={shiftDay(date, -1)}
      nextDate={shiftDay(date, 1)}
      today={kstDateString()}
      query={q}
    />
  );
}
