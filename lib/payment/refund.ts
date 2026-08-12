import 'server-only';

import { and, eq, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { iapOrders, iapRefunds, monthlyPurchaseLimits } from '@/lib/db/schema/payment';
import { mailbox } from '@/lib/db/schema/mailbox';
import { battlePassSegments } from '@/lib/db/schema/battlepass';
import { characters } from '@/lib/db/schema/server';
import { userSupplyBoxes } from '@/lib/db/schema/supply';
import { bpTierReward } from '@/lib/game/balance';
import { kstMonthString } from '@/lib/kst';
import { reclaimProductGrant } from '@/lib/game/shop/grant';
import { PREMIUM, shopGrant } from '@/lib/game/shop/catalog';
import { reclaimBpSegment } from '@/lib/game/battlepass';

import { raisePaymentAlert } from './alert';
import { getPortonePayment } from './portone';
import { parseBpProduct } from './purchase';

/** 회수하지 못한 잔여분(= 유저가 이미 소비한 유상분). 0이면 전액 회수 성공. */
export type ClawbackShortfall = { diamond: number; boxes: number };

export type RefundResult =
  | { ok: true; already: boolean; short?: ClawbackShortfall }
  | { ok: false; code: 'ORDER_NOT_FOUND' | 'NOT_CANCELLED' };

export type ClawbackPreview = {
  diamondNeed: number;
  diamondHave: number;
  boxesNeed: number;
  boxesHave: number;
  sufficient: boolean;
};

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
/** db(사전조회)와 tx(환불 트랜잭션)가 같은 산식을 쓰게 하는 읽기 실행자. */
type Reader = Pick<Tx, 'select'>;

const num = (n: number) => n.toLocaleString('ko-KR');

/**
 * 이 주문의 회수 대상 수량 — 지급의 역연산(reclaimProductGrant / reclaimBpSegment와 동일 산식).
 *
 *  - 일반 상품: shopGrant 지급량 그대로.
 *  - 프리미엄: 회수가 **우편(미수령분) 삭제 + 일일 드립 중단**이라 지갑 재화를 건드리지 않는다 → 0.
 *    이미 수령한 우편분은 의도적으로 자동 회수 대상이 아니다(운영 수동, grant.ts 참조).
 *  - 배틀패스 구간: 회수 대상이 '구간 권리'(row 삭제)라 결제액·지급액이 곧 회수액이 아니다.
 *    실제로 회수되는 재화는 **이미 수령한 프리미엄 마일스톤 보상**뿐 — 미수령 구간이면 0.
 *
 * lock=true(환불 tx 안)면 배틀패스 구간 행을 FOR UPDATE로 잠근다 — 아래 두 가지를 동시에 해결한다.
 *  ① 교착 회피: 수령 경로(claimSegment·claimPremiumTier…)는 **구간 → 캐릭터** 순으로 잠근다.
 *     환불이 readHoldings(characters)를 먼저 잠그고 reclaimBpSegment에서 구간을 잠그면 정확히
 *     역순이라, 같은 유저에게 환불과 수령이 겹치는 순간 한쪽이 40P01(deadlock_detected)로 죽는다. 여기서 먼저
 *     잠그면 환불도 **구간 → 캐릭터**가 되어 순환이 사라진다.
 *  ② 회수액 정합: 잠그지 않으면 이 시점의 tiers로 need를 계산하고 reclaimBpSegment는 그 뒤
 *     새로 읽은 tiers로 회수해, 그 사이 수령이 커밋되면 부족분 판정(preview)이 실제와 어긋난다.
 */
async function clawbackNeed(
  exec: Reader,
  userId: string,
  serverId: number,
  productCode: string,
  lock: boolean,
): Promise<{ diamond: number; boxes: number }> {
  const bp = parseBpProduct(productCode);
  if (bp) {
    const segQ = exec
      .select({ tiers: battlePassSegments.premiumClaimedTiers })
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
    const [seg] = lock ? await segQ.for('update') : await segQ;
    if (!seg) return { diamond: 0, boxes: 0 }; // 미구매/이미 환불 — 회수할 것 없음.
    let total = 0;
    for (const tl of seg.tiers) total += bpTierReward(bp.type, tl, true);
    return bp.type === 'enhance' ? { diamond: total, boxes: 0 } : { diamond: 0, boxes: total };
  }
  if (productCode === PREMIUM.id) return { diamond: 0, boxes: 0 };
  const g = shopGrant(productCode);
  return { diamond: g?.diamond ?? 0, boxes: g?.boxes ?? 0 };
}

/**
 * 보유량(다이아 + 상자는 슬롯 합계). lock=true면 회수 tx 안에서 잔액을 잠근다.
 * 상자 판정을 슬롯 합계로 두는 이유: 회수는 슬롯 균등 분배로 빠지지만 유저는 한 슬롯만 몰아 열 수
 * 있어 per-slot으로 보면 과차단된다. 합계가 충분한데 특정 슬롯만 모자란 잔여는 손실 처리.
 */
async function readHoldings(
  exec: Reader,
  userId: string,
  serverId: number,
  lock: boolean,
): Promise<{ diamond: number; boxes: number }> {
  const charQ = exec
    .select({ diamond: characters.diamond })
    .from(characters)
    .where(and(eq(characters.userId, userId), eq(characters.serverId, serverId)))
    .limit(1);
  const boxQ = exec
    .select({ count: userSupplyBoxes.count })
    .from(userSupplyBoxes)
    .where(and(eq(userSupplyBoxes.userId, userId), eq(userSupplyBoxes.serverId, serverId)));
  // 잠금 순서는 회수가 쓰는 순서(characters → user_supply_boxes)와 동일 — 교착 회피.
  // ⚠ 배틀패스 구간 행은 이 함수 **이전에** 잠겨 있어야 한다(clawbackNeed lock=true 주석 ①).
  const [ch] = lock ? await charQ.for('update') : await charQ;
  const boxes = lock ? await boxQ.for('update') : await boxQ;
  return {
    diamond: Number(ch?.diamond ?? 0n),
    boxes: boxes.reduce((a, b) => a + Number(b.count), 0),
  };
}

function toPreview(
  need: { diamond: number; boxes: number },
  have: { diamond: number; boxes: number },
): ClawbackPreview {
  return {
    diamondNeed: need.diamond,
    diamondHave: have.diamond,
    boxesNeed: need.boxes,
    boxesHave: have.boxes,
    sufficient: need.diamond <= have.diamond && need.boxes <= have.boxes,
  };
}

/**
 * 환불 전 회수 가능액 사전 계산 — **PG 취소 전에** 부를 것(어드민 환불 게이트).
 * 약관(환불 §1): 이미 사용·소모한 재화는 청약철회가 제한된다. 회수액이 보유액을 넘으면
 * 환불만 나가고 재화는 남는 상태가 되므로, 그 전에 막을 근거를 준다.
 */
export async function previewClawback(
  userId: string,
  serverId: number,
  productCode: string,
): Promise<ClawbackPreview> {
  const [need, have] = await Promise.all([
    clawbackNeed(db, userId, serverId, productCode, false), // 사전조회 — tx 밖이라 잠그지 않는다.
    readHoldings(db, userId, serverId, false),
  ]);
  return toPreview(need, have);
}

/** 부족 내역 문구 — 어드민 차단 사유와 사고 알림이 같은 사실을 같은 말로 전하도록 공용. */
export function formatClawbackShortfall(p: ClawbackPreview): string {
  const parts: string[] = [];
  if (p.diamondNeed > p.diamondHave)
    parts.push(`다이아 지급 ${num(p.diamondNeed)} / 보유 ${num(p.diamondHave)}`);
  if (p.boxesNeed > p.boxesHave)
    parts.push(`보급상자 지급 ${num(p.boxesNeed)} / 보유 ${num(p.boxesHave)}`);
  if (parts.length === 0) return '회수 가능 — 부족분 없음.';
  return `회수할 재화가 부족합니다 — ${parts.join(' · ')}. 약관상 이미 사용·소모한 재화는 청약철회가 제한됩니다(환불 정책 §1).`;
}

/**
 * 결제 전체 취소(환불) 처리 — 웹훅 Transaction.Cancelled에서 호출(멱등). REGULATORY §환불 시 재화 자동 회수.
 *  portone_order_id로 주문 조회 → 포트원 서버에서 CANCELLED 재확인(본문 신뢰 X) → 트랜잭션으로
 *  주문 refunded 전이 + 지급 회수(reclaimProductGrant) + 월 누적 차감 + iap_refunds 기록.
 *  멱등: 이미 refunded면 회수 없이 already. 동시(웹훅 재전송) 호출은 FOR UPDATE + status 가드로 1회만.
 *  부분취소(PartialCancelled)는 고정가 디지털 상품 특성상 드물어 자동 회수 대상 아님(웹훅에서 로그만).
 *
 * ⚠ 회수 부족(유저가 이미 써버림)은 **여기서 막지 않는다** — 비대칭이 의도된 설계다.
 *  · 어드민 환불 = PG 취소 **전에** previewClawback으로 사전 차단(막을 수 있는 유일한 지점).
 *  · 웹훅/크론 = PG에서 이미 취소가 끝난 뒤 도착하므로 막으면 "환불됐는데 재화도 남는" 상태가 된다.
 *    → 회수는 가능한 만큼 하고, 부족분을 clawback_done=false + REFUND_CLAWBACK_SHORT 알림으로 남긴다.
 */
export async function refundPurchase(paymentId: string): Promise<RefundResult> {
  const [order] = await db
    .select({
      id: iapOrders.id,
      userId: iapOrders.userId,
      serverId: iapOrders.serverId,
      productCode: iapOrders.productCode,
      amountKrw: iapOrders.amountKrw,
      status: iapOrders.status,
      paidAt: iapOrders.paidAt,
      createdAt: iapOrders.createdAt,
    })
    .from(iapOrders)
    .where(eq(iapOrders.portoneOrderId, paymentId))
    .limit(1);
  if (!order) return { ok: false, code: 'ORDER_NOT_FOUND' };
  if (order.status === 'refunded') return { ok: true, already: true };

  // 포트원 서버 권위 — 실제 전체 취소 상태인지 재확인.
  const pay = await getPortonePayment(paymentId);
  if (pay.status !== 'CANCELLED') return { ok: false, code: 'NOT_CANCELLED' };

  // 월 누적은 결제가 집계된 달(결제월) 기준으로 되돌린다 — 취소가 다음 달에 와도 정확.
  const paidMonth = kstMonthString(order.paidAt ?? order.createdAt);

  // 부족분은 tx 밖으로 반환 — 알림은 커밋 후 발화(롤백 시 허위 알림 방지 + 잠금 보유 중 외부 HTTP 금지).
  const short = await db.transaction(async (tx): Promise<ClawbackPreview | null> => {
    const [locked] = await tx
      .select({ status: iapOrders.status, grantSkipped: iapOrders.grantSkipped })
      .from(iapOrders)
      .where(eq(iapOrders.id, order.id))
      .for('update');
    if (!locked || locked.status === 'refunded') return null; // 이미 다른 호출이 처리.
    const wasPaid = locked.status === 'paid';
    let clawbackDone = false;
    let shortPreview: ClawbackPreview | null = null;

    await tx.update(iapOrders).set({ status: 'refunded' }).where(eq(iapOrders.id, order.id));

    if (wasPaid) {
      // 미성년 월 한도 누적 되돌리기(0 클램프).
      //
      // ⚠ 회수보다 **먼저** 와야 한다 — 지급(completePurchase)이 iap_orders 다음으로 이 행을 잠그고
      // 그 뒤에 재화(segments·characters)를 건드린다. 환불이 재화를 먼저 잠그면 두 트랜잭션의 순서가
      // 정확히 반대가 되고, iap_orders는 **서로 다른 주문 행**이라 직렬화해 주지 못한다. 같은 유저가
      // 결제하는 동안 다른 주문이 환불되면(웹훅·recon·어드민) 40P01이 난다.
      // 전역 순서: iap_orders → monthly_purchase_limits → battlepass_segments → characters → user_supply_boxes.
      await tx
        .update(monthlyPurchaseLimits)
        .set({ totalKrw: sql`GREATEST(0, ${monthlyPurchaseLimits.totalKrw} - ${order.amountKrw})` })
        .where(
          and(
            eq(monthlyPurchaseLimits.userId, order.userId),
            eq(monthlyPurchaseLimits.kstMonth, paidMonth),
          ),
        );

      // 지급분 회수 — 배틀패스 구간(구간 row 삭제+보상 회수) vs 상점 상품(다이아·상자·주기마크).
      // ⚠ grant_skipped 주문(특가 중복·미성년 보류 — 지급 없이 paid)은 회수를 건너뛴다:
      // 회수하면 "다른 주문이 지급한" 재화를 몰수한다(2026-07-07 전수감사 高-1).
      // 월누적 차감·감사기록은 결제 자체에 귀속되므로 그대로 수행.
      const bp = parseBpProduct(order.productCode);
      if (locked.grantSkipped) {
        // no-op — 지급된 것이 없음.
      } else {
        // 회수 직전 잔액을 잠그고 부족분을 산정 — 회수는 0 클램프라 사후엔 얼마가 모자랐는지 알 수 없다.
        // 회수 대상이 없는 상품(프리미엄·미수령 배틀패스)은 잔액을 볼 필요도 잠글 필요도 없다.
        // lock=true — 배틀패스 구간이면 여기서 구간 행을 잠근다. 수령 경로와 잠금 순서를
        // 맞추기 위해 **readHoldings보다 먼저** 와야 한다(clawbackNeed 주석 ①).
        const need = await clawbackNeed(tx, order.userId, order.serverId, order.productCode, true);
        const have =
          need.diamond > 0 || need.boxes > 0
            ? await readHoldings(tx, order.userId, order.serverId, true)
            : { diamond: 0, boxes: 0 };
        const preview = toPreview(need, have);
        // 원장 ref는 주문 단위로 — 분쟁 조사는 "이 주문이 준 것과 되찾은 것"을 맞춰보는 일이라
        // 지급(iap)·회수(refund_clawback)가 같은 키로 묶여야 한다. iap_refunds.order_id와 동일 축.
        const ref = `order:${order.id}`;
        if (bp) {
          await reclaimBpSegment(tx, order.userId, order.serverId, bp.type, bp.segmentIndex, ref);
        } else {
          await reclaimProductGrant(tx, order.userId, order.serverId, order.productCode, ref);
        }
        // 실제로 전액 회수됐을 때만 done — 부족분이 있으면 미회수 채권으로 남긴다(감사 C2).
        clawbackDone = preview.sufficient;
        if (!preview.sufficient) shortPreview = preview;
      }
      // 환불 안내 우편(notice, 보상 없음). 웹훅·어드민 환불 공통.
      await tx.insert(mailbox).values({
        userId: order.userId,
        serverId: order.serverId,
        type: 'notice',
        title: '결제 환불 안내',
        body: `결제(₩${Number(order.amountKrw).toLocaleString('ko-KR')})가 환불 처리되었습니다. 지급되었던 재화가 있다면 함께 회수됩니다. 문의는 고객센터로 연락 주세요.`,
        senderLabel: '인생강화',
        payload: {},
      });
    }

    // 환불 감사 기록 — clawbackDone은 지급분을 **실제로 전액** 회수했는지
    // (pending 취소·grant_skipped는 회수 없음, 소비분이 남으면 false).
    await tx.insert(iapRefunds).values({
      orderId: order.id,
      userId: order.userId,
      reason: 'user',
      amountKrw: order.amountKrw,
      clawbackDone,
    });
    return shortPreview;
  });

  if (short) {
    await raisePaymentAlert('REFUND_CLAWBACK_SHORT', {
      paymentId,
      orderId: order.id,
      detail: `${formatClawbackShortfall(short)} 환불은 완료(PG 취소 완료분)되고 부족분은 회수하지 못했습니다 — user=${order.userId} server=${order.serverId} product=${order.productCode}. 수동 조치 필요.`,
    });
    return {
      ok: true,
      already: false,
      short: {
        diamond: Math.max(0, short.diamondNeed - short.diamondHave),
        boxes: Math.max(0, short.boxesNeed - short.boxesHave),
      },
    };
  }
  return { ok: true, already: false };
}
