import 'server-only';

import { and, desc, eq, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { iapOrders, monthlyPurchaseLimits, identityVerifications } from '@/lib/db/schema/payment';
import { characters } from '@/lib/db/schema/server';
import { shopPurchases } from '@/lib/db/schema/shop';
import { battlePassSegments } from '@/lib/db/schema/battlepass';
import { kstMonthString } from '@/lib/kst';
import { bpSegmentPriceKrw, type BattlePassType } from '@/lib/game/balance';
import { paidProduct, shopGrant, productPeriod } from '@/lib/game/shop/catalog';
import { periodKey } from '@/lib/game/shop/period';
import { applyProductGrant } from '@/lib/game/shop/grant';
import { applyBpSegmentPurchase } from '@/lib/game/battlepass';

import { getPortonePayment } from './portone';

/**
 * 배틀패스(성장패스) 결제 상품코드 — `bp_<type>_<구간index>`(예: bp_enhance_2, bp_transcend_0).
 * 가격은 balance(bpSegmentPriceKrw) 권위, 지급은 구간 해금+소급(applyBpSegmentPurchase).
 */
const BP_RE = /^bp_(enhance|transcend)_(\d+)$/;
function parseBpProduct(productId: string): { type: BattlePassType; segmentIndex: number } | null {
  const m = BP_RE.exec(productId);
  if (!m) return null;
  return { type: m[1] as BattlePassType, segmentIndex: Number(m[2]) };
}
function bpOrderName(type: BattlePassType, segmentIndex: number): string {
  return `성장 ${type === 'enhance' ? '강화' : '초월'} 패스 ${segmentIndex + 1}구간`;
}

/** 미성년 월 결제 한도(원) — REGULATORY. 본인인증으로 미성년 확정된 계정만 적용. */
const MINOR_MONTHLY_LIMIT_KRW = 70_000;

export type PurchaseErrorCode =
  | 'UNKNOWN_PRODUCT'
  | 'ALREADY_PURCHASED' // 주기 상품 같은 주기 재구매
  | 'MINOR_LIMIT' // 미성년 월 한도 초과
  | 'CONFIG'; // 포트원 env 미설정

export class PurchaseError extends Error {
  constructor(public code: PurchaseErrorCode) {
    super(code);
    this.name = 'PurchaseError';
  }
}

/**
 * 포트원 결제창 설정(storeId·channelKey) — 미설정이면 결제 비활성(payEnabled=false).
 * 값은 클라가 직접 읽지 않고 createOrder 응답으로 전달되므로 **런타임 서버 env**(비-public)를 우선 읽는다.
 * 비-public은 빌드 인라인이 아니라 env 설정 후 재배포만으로 즉시 반영(NEXT_PUBLIC 인라인 함정 회피).
 * 구버전 호환을 위해 NEXT_PUBLIC_* 도 폴백으로 본다(빌드타임에 값이 있었던 경우).
 */
export function portoneConfig(): { storeId: string; channelKey: string } | null {
  const storeId = process.env.PORTONE_STORE_ID || process.env.NEXT_PUBLIC_PORTONE_STORE_ID;
  const channelKey =
    process.env.PORTONE_CHANNEL_KEY || process.env.NEXT_PUBLIC_PORTONE_CHANNEL_KEY;
  if (!storeId || !channelKey) return null;
  return { storeId, channelKey };
}

/** 계정의 미성년 여부 + 이번 달(KST) 누적 결제액. 본인인증 미시행(행 없음)이면 isMinor=false. */
async function minorStatus(
  userId: string,
  kstMonth: string,
): Promise<{ isMinor: boolean; monthlyKrw: number }> {
  const [idRow, limitRow] = await Promise.all([
    db
      .select({ isAdult: identityVerifications.isAdult })
      .from(identityVerifications)
      .where(eq(identityVerifications.userId, userId))
      .orderBy(desc(identityVerifications.verifiedAt))
      .limit(1),
    db
      .select({ total: monthlyPurchaseLimits.totalKrw })
      .from(monthlyPurchaseLimits)
      .where(
        and(eq(monthlyPurchaseLimits.userId, userId), eq(monthlyPurchaseLimits.kstMonth, kstMonth)),
      )
      .limit(1),
  ]);
  return {
    isMinor: idRow[0] ? !idRow[0].isAdult : false,
    monthlyKrw: Number(limitRow[0]?.total ?? 0n),
  };
}

export type CreatedOrder = {
  /** 포트원 결제창 paymentId(= portone_order_id, 멱등 키). */
  paymentId: string;
  orderName: string;
  amountKrw: number;
  storeId: string;
  channelKey: string;
  /** 구매자 이름 — 이니시스 V2 일반결제 필수(customer.fullName). 닉네임 사용. */
  customerName: string;
};

/**
 * 주문 생성(pending) — 결제창 띄우기 직전. 금액·지급량은 **서버 카탈로그 권위**(클라 입력 무시).
 *  사전 가드: ① 알 수 없는 상품 ② 주기 상품 같은 주기 재구매 ③ 미성년 월 한도 초과.
 * 실제 지급은 결제 성사(웹훅/검증) 후 completePurchase에서만. 주기 사전체크는 비원자(드문 동시구매 경쟁은 허용).
 */
export async function createOrder(
  userId: string,
  serverId: number,
  productId: string,
): Promise<CreatedOrder> {
  const cfg = portoneConfig();
  if (!cfg) throw new PurchaseError('CONFIG');

  // 상품 해석 — 배틀패스 구간(bp_*) vs 상점 상품. 금액·지급은 서버 권위.
  const bp = parseBpProduct(productId);
  let krw: number;
  let orderName: string;
  let diamondGranted = 0;

  if (bp) {
    krw = bpSegmentPriceKrw(bp.type, bp.segmentIndex);
    orderName = bpOrderName(bp.type, bp.segmentIndex);
    // 이미 산 구간이면 차단(구간 row 존재 = 구매됨).
    const [owned] = await db
      .select({ idx: battlePassSegments.segmentIndex })
      .from(battlePassSegments)
      .where(
        and(
          eq(battlePassSegments.userId, userId),
          eq(battlePassSegments.serverId, serverId),
          eq(battlePassSegments.passType, bp.type),
          eq(battlePassSegments.segmentIndex, bp.segmentIndex),
        ),
      )
      .limit(1);
    if (owned) throw new PurchaseError('ALREADY_PURCHASED');
  } else {
    const info = paidProduct(productId);
    const g = shopGrant(productId);
    if (!info || !g) throw new PurchaseError('UNKNOWN_PRODUCT');
    krw = info.krw;
    orderName = info.orderName;
    diamondGranted = g.diamond;

    const period = productPeriod(productId);
    if (period) {
      const [row] = await db
        .select({ periodKey: shopPurchases.periodKey })
        .from(shopPurchases)
        .where(
          and(
            eq(shopPurchases.userId, userId),
            eq(shopPurchases.serverId, serverId),
            eq(shopPurchases.productId, productId),
          ),
        )
        .limit(1);
      if (row?.periodKey === periodKey(period)) throw new PurchaseError('ALREADY_PURCHASED');
    }
  }

  const kstMonth = kstMonthString();
  const { isMinor, monthlyKrw } = await minorStatus(userId, kstMonth);
  if (isMinor && monthlyKrw + krw > MINOR_MONTHLY_LIMIT_KRW) {
    throw new PurchaseError('MINOR_LIMIT');
  }

  // 구매자 이름 — 이니시스 V2 일반결제 필수. 캐릭터 닉네임 사용(없으면 '구매자' 폴백).
  const [ch] = await db
    .select({ nickname: characters.nickname })
    .from(characters)
    .where(and(eq(characters.userId, userId), eq(characters.serverId, serverId)))
    .limit(1);
  const customerName = ch?.nickname?.trim() || '구매자';

  const paymentId = `payment-${crypto.randomUUID()}`;
  await db.insert(iapOrders).values({
    serverId,
    userId,
    portoneOrderId: paymentId,
    productCode: productId,
    amountKrw: BigInt(krw),
    diamondGranted: BigInt(diamondGranted),
    status: 'pending',
  });

  return {
    paymentId,
    orderName,
    amountKrw: krw,
    storeId: cfg.storeId,
    channelKey: cfg.channelKey,
    customerName,
  };
}

export type CompleteResult =
  | { ok: true; already: boolean }
  | { ok: false; code: 'ORDER_NOT_FOUND' | 'NOT_PAID' | 'AMOUNT_MISMATCH' };

/**
 * 결제 완료 처리 — 웹훅·클라 검증 양쪽에서 호출(멱등). portone_order_id로 주문 조회 →
 * 포트원 서버에서 PAID·금액·통화 재확인 → 트랜잭션으로 주문 paid 전이 + 지급 + 월 누적 가산.
 *  멱등: 이미 paid면 재지급 없이 already. 동시(웹훅+클라) 호출은 FOR UPDATE + status 가드로 1회만 지급.
 *  금액 불일치(위변조 의심)는 지급하지 않고 AMOUNT_MISMATCH 반환(운영 알림 대상).
 */
export async function completePurchase(paymentId: string): Promise<CompleteResult> {
  const [order] = await db
    .select({
      id: iapOrders.id,
      userId: iapOrders.userId,
      serverId: iapOrders.serverId,
      productCode: iapOrders.productCode,
      amountKrw: iapOrders.amountKrw,
      status: iapOrders.status,
    })
    .from(iapOrders)
    .where(eq(iapOrders.portoneOrderId, paymentId))
    .limit(1);
  if (!order) return { ok: false, code: 'ORDER_NOT_FOUND' };
  if (order.status === 'paid') return { ok: true, already: true };

  // 포트원 서버 권위 재확인 — PAID + 원화 + 주문 금액 일치만 지급(가상계좌 발급 단계는 입금 전이라 제외).
  const pay = await getPortonePayment(paymentId);
  if (pay.status !== 'PAID') return { ok: false, code: 'NOT_PAID' };
  if (pay.currency !== 'KRW' || pay.amountTotal !== Number(order.amountKrw)) {
    return { ok: false, code: 'AMOUNT_MISMATCH' };
  }

  const kstMonth = kstMonthString();
  await db.transaction(async (tx) => {
    // 주문 잠금 + 상태 재확인 — 동시 호출 중 1회만 지급(멱등 핵심).
    const [locked] = await tx
      .select({ status: iapOrders.status })
      .from(iapOrders)
      .where(eq(iapOrders.id, order.id))
      .for('update');
    if (!locked || locked.status === 'paid') return; // 이미 다른 호출이 지급 완료.

    await tx
      .update(iapOrders)
      .set({ status: 'paid', paidAt: new Date() })
      .where(eq(iapOrders.id, order.id));

    // 지급 — 배틀패스 구간 해금(소급 포함) vs 상점 상품. bp는 이미 보유면 null(멱등 무해).
    const bp = parseBpProduct(order.productCode);
    if (bp) {
      await applyBpSegmentPurchase(tx, order.userId, order.serverId, bp.type, bp.segmentIndex);
    } else {
      await applyProductGrant(tx, order.userId, order.serverId, order.productCode);
    }

    // 월 누적 가산 — 미성년 한도 추적(전 계정 기록, 한도는 미성년만 createOrder서 적용).
    await tx
      .insert(monthlyPurchaseLimits)
      .values({ userId: order.userId, kstMonth, totalKrw: order.amountKrw })
      .onConflictDoUpdate({
        target: [monthlyPurchaseLimits.userId, monthlyPurchaseLimits.kstMonth],
        set: { totalKrw: sql`${monthlyPurchaseLimits.totalKrw} + ${order.amountKrw}` },
      });
  });

  return { ok: true, already: false };
}
