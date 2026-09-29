import 'server-only';

import { eq, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { iapOrders, monthlyPurchaseLimits } from '@/lib/db/schema/payment';
import { kstMonthString } from '@/lib/kst';

import { raisePaymentAlert } from './alert';
import { refundPlayOrder, type PlayProductPurchase } from './play-api';
import { decideAttribution } from './play-ids';
import { completePurchase, type CompleteResult } from './purchase';

/**
 * 표식이 있는 Play 구매 처리(docs/PLAYSTORE.md "결제 귀속 표식", 2026-09-29) — RTDN·상점 복구가 공통으로 부른다.
 *
 * 구매에 실린 주문번호(profileId)·계정 표식(accountId)으로 주문을 찾아, 판정(play-ids.decideAttribution)대로
 *  - grant: 그 주문 주인에게 지급(completePurchase — 구글 재검증·지급·소모, 멱등)
 *  - duplicate: 중복 청구 → 지급 보류 주문 행을 남기고 자동 환불 + 우편
 *  - mismatch: 지급 금지 → 자동 환불 + 경보
 * 표식이 없는 구매(1.0.2 이하 앱)는 null — 호출부가 종전 규칙으로 처리한다.
 *
 * 호출 전제: 구글 구매 조회(g)를 이미 했고 purchaseState가 0(구매 완료) 또는 2(보류)다. 취소(1)는 부르지 않는다.
 */
export type AttributedOutcome =
  | { kind: 'granted'; paymentId: string; userId: string; already: boolean }
  | { kind: 'pending'; paymentId: string; userId: string }
  /** 지급 보류(중복 특가·미성년 한도 등)·환불 확정 — completePurchase가 환불·경보까지 처리했다. */
  | { kind: 'not_granted'; paymentId: string; userId: string; code: Exclude<CompleteResult, { ok: true }>['code'] }
  | { kind: 'refunded'; reason: 'duplicate' | 'mismatch'; userId: string | null }
  /** 자동 환불 호출 실패 — 경보를 남겼다. 중복 건은 주문 행이 남아 정산 크론이 다시 환불한다. */
  | { kind: 'refund_failed'; reason: 'duplicate' | 'mismatch'; userId: string | null }
  /** 보류(2) 결제라 아직 환불할 수 없다 — 결제가 끝나면 RTDN이 다시 온다. 아무것도 하지 않았다. */
  | { kind: 'deferred' };

/** 중복 결제 자동 환불 우편 — 운영 우편 이모지 절제(💎📦 외 금지). */
export const DUPLICATE_REFUND_NOTICE = {
  title: '중복 결제 자동 환불 안내',
  body: (amountKrw: number) =>
    `같은 구매에 결제가 한 번 더 진행되어, 추가로 결제된 ₩${amountKrw.toLocaleString('ko-KR')}를 자동으로 환불했습니다. 구글 플레이를 통해 결제 수단으로 환불되며, 반영까지 며칠 걸릴 수 있습니다. 문의는 고객센터로 연락 주세요.`,
};

export async function settleAttributedPurchase(sku: string, token: string, g: PlayProductPurchase): Promise<AttributedOutcome | null> {
  const profileId = g.obfuscatedExternalProfileId;
  const accountId = g.obfuscatedExternalAccountId;
  if (!profileId || !accountId) return null;

  const [order] = await db
    .select({
      id: iapOrders.id,
      userId: iapOrders.userId,
      serverId: iapOrders.serverId,
      productCode: iapOrders.productCode,
      amountKrw: iapOrders.amountKrw,
      diamondGranted: iapOrders.diamondGranted,
      provider: iapOrders.provider,
      playSku: iapOrders.playSku,
      status: iapOrders.status,
      token: iapOrders.playPurchaseToken,
    })
    .from(iapOrders)
    .where(eq(iapOrders.portoneOrderId, profileId))
    .limit(1);

  const decision = decideAttribution(order ?? null, { sku, accountId, token });

  if (decision === 'mismatch') {
    // 보류(2) 결제는 아직 끝나지 않아 환불할 수 없다 — 결제가 끝나면 RTDN이 다시 와서 여기로 온다.
    if (g.purchaseState !== 0) return { kind: 'deferred' };
    return refundMismatch(sku, profileId, g, order ? `주문 ${profileId}(${order.provider}·${order.playSku}) 계정·상품 불일치` : `주문 ${profileId} 없음`);
  }
  if (!order) return null; // mismatch가 아닌데 주문이 없을 수는 없다(타입 좁히기).

  if (decision === 'already') return { kind: 'granted', paymentId: profileId, userId: order.userId, already: true };

  if (decision === 'grant') {
    const r = await completePurchase(profileId, order.userId, { playPurchaseToken: token });
    if (r.ok) return { kind: 'granted', paymentId: profileId, userId: order.userId, already: r.already };
    if (r.code === 'PENDING') return { kind: 'pending', paymentId: profileId, userId: order.userId };
    // 판정 뒤 경합 — 다른 토큰이 이 주문을 먼저 지급·환불했다. 이 구매는 중복 청구다.
    if (r.code === 'TOKEN_USED' || r.code === 'REFUNDED') return refundDuplicate(order, sku, token, g);
    return { kind: 'not_granted', paymentId: profileId, userId: order.userId, code: r.code };
  }

  // duplicate
  if (g.purchaseState !== 0) return { kind: 'deferred' };
  return refundDuplicate(order, sku, token, g);
}

type OrderRow = {
  userId: string;
  serverId: number;
  productCode: string;
  amountKrw: bigint;
  diamondGranted: bigint;
};

/**
 * 중복 청구 자동 환불 — completePurchase의 중복 결제 경로와 같은 모양으로 남긴다.
 *  ① 지급 보류 주문 행(paid·grant_skipped·토큰·구글 주문번호) + 월누적 가산을 한 트랜잭션으로 기록
 *     → 환불 호출이 실패해도 정산 크론 C단계(지급 보류 환불 재시도)가 다시 환불하고, 소모하지 않으니 3일 자동 환불도 남는다.
 *     토큰 부분 유니크라 RTDN·복구가 동시에 와도 한쪽만 기록한다(진 쪽은 이미 처리된 것으로 본다).
 *  ② 구글 환불(권한 회수) → ③ refundPurchase로 마감(월누적 복원·환불 기록·우편).
 */
async function refundDuplicate(order: OrderRow, sku: string, token: string, g: PlayProductPurchase): Promise<AttributedOutcome> {
  const googleOrderId = g.orderId ?? null;
  const paymentId = `gp-${crypto.randomUUID()}`;
  try {
    await db.transaction(async (tx) => {
      await tx.insert(iapOrders).values({
        serverId: order.serverId,
        userId: order.userId,
        portoneOrderId: paymentId,
        productCode: order.productCode,
        amountKrw: order.amountKrw,
        diamondGranted: order.diamondGranted,
        status: 'paid',
        grantSkipped: true,
        paidAt: new Date(),
        provider: 'play',
        playSku: sku,
        playPurchaseToken: token,
        playOrderId: googleOrderId,
      });
      // 월누적 가산 — refundPurchase가 paid 주문 환불 때 결제액만큼 되돌리므로 짝을 맞춘다(completePurchase와 같은 순서·잠금).
      await tx
        .insert(monthlyPurchaseLimits)
        .values({ userId: order.userId, kstMonth: kstMonthString(), totalKrw: order.amountKrw })
        .onConflictDoUpdate({
          target: [monthlyPurchaseLimits.userId, monthlyPurchaseLimits.kstMonth],
          set: { totalKrw: sql`${monthlyPurchaseLimits.totalKrw} + ${order.amountKrw}` },
        });
    });
  } catch (e) {
    // 같은 토큰이 이미 다른 행에 묶였다 — 동시에 온 다른 경로가 먼저 처리했다(환불도 그쪽이 한다).
    const [bound] = await db.select({ status: iapOrders.status }).from(iapOrders).where(eq(iapOrders.playPurchaseToken, token)).limit(1);
    if (bound) return { kind: 'refunded', reason: 'duplicate', userId: order.userId };
    throw e;
  }

  let refundCalled = false;
  try {
    if (!googleOrderId) throw new Error('구글 주문번호 없음');
    await refundPlayOrder(googleOrderId, true);
    refundCalled = true;
    const { refundPurchase } = await import('./refund');
    const rr = await refundPurchase(paymentId, {
      reason: 'error',
      playVoided: true,
      notice: { title: DUPLICATE_REFUND_NOTICE.title, body: DUPLICATE_REFUND_NOTICE.body(Number(order.amountKrw)) },
    });
    if (!rr.ok) throw new Error(`환불 마감 실패 ${rr.code}`);
    console.info(`[play-attribution] 중복 결제 자동 환불 ${paymentId} (${order.productCode} · 서버 ${order.serverId} · 구글 ${googleOrderId})`);
    return { kind: 'refunded', reason: 'duplicate', userId: order.userId };
  } catch (e) {
    console.error('[play-attribution] duplicate refund failed', paymentId, e);
    await raisePaymentAlert('REFUND_RECLAIM_FAILED', {
      paymentId,
      detail: refundCalled
        ? `중복 결제(${order.productCode} · 구글 ${googleOrderId}) — 구글 환불은 됐고 주문 마감만 지연. play-sync(환불 동기화)가 곧 마감한다 — 확인만.`
        : `중복 결제(${order.productCode} · 구글 ${googleOrderId ?? '?'}) 자동 환불 실패 — ${(e as Error)?.message ?? e}. 정산 크론이 30분 뒤 다시 환불한다 — 그 뒤에도 남으면 Play 콘솔에서 환불(지급된 것 없음).`,
    }).catch(() => undefined);
    return { kind: 'refund_failed', reason: 'duplicate', userId: order.userId };
  }
}

/**
 * 표식 불일치 — 누구에게도 지급하지 않고 환불한다(앱 변조·데이터 손실 신호). 주인을 모르니 주문 행·우편은 남기지 않는다
 * (play-sync voided 동기화에서 '주문 미매칭'으로 한 번 세어진다). 경보는 항상 남긴다.
 */
async function refundMismatch(sku: string, profileId: string, g: PlayProductPurchase, why: string): Promise<AttributedOutcome> {
  let ok = false;
  let err = '';
  try {
    if (!g.orderId) throw new Error('구글 주문번호 없음');
    await refundPlayOrder(g.orderId, true);
    ok = true;
  } catch (e) {
    err = (e as Error)?.message ?? String(e);
  }
  await raisePaymentAlert('PLAY_ATTRIBUTION_MISMATCH', {
    paymentId: `attr:${g.orderId ?? profileId}`,
    detail: `구글 주문 ${g.orderId ?? '?'}(${sku}) 결제 표식 불일치 — ${why}. ${
      ok ? '지급하지 않고 자동 환불함(확인만).' : `자동 환불 실패(${err.slice(0, 120)}) — Play 콘솔에서 환불 필요(지급된 것 없음).`
    }`,
  }).catch(() => undefined);
  return ok ? { kind: 'refunded', reason: 'mismatch', userId: null } : { kind: 'refund_failed', reason: 'mismatch', userId: null };
}
