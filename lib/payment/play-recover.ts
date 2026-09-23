import 'server-only';

import { and, desc, eq, gte, inArray, isNull, ne, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { iapOrders } from '@/lib/db/schema/payment';

import { raisePaymentAlert } from './alert';
import { getPlayProductPurchase, PlayApiError, type PlayProductPurchase } from './play-api';
import { RTDN_LOOKBACK_MS } from './play-rtdn';
import { isKnownPlaySku, productIdForPlaySku } from './play-sku';
import { completePurchase, createPlayOrder, PurchaseError, type CompleteResult } from './purchase';

/**
 * Play 결제 복구(2026-09-22) — 구글에는 구매가 살아 있는데 우리 서버가 지급하지 못한 건을 되살린다.
 *
 * 생긴 일: 서비스 계정 401로 검증이 실패하자 클라가 시트를 fail로 닫았고, 토큰은 저장되지 않았다.
 * 구글은 소모(확인)되지 않은 소모성 구매를 "already own"으로 막아 같은 상품을 다시 살 수도 없고,
 * 3일 뒤 자동 환불이 유일한 구제였다. 앱이 상점을 열 때 기기의 Digital Goods `listPurchases()`가
 * 돌려주는 (sku, token)을 여기로 보내면 다시 검증·지급·소모한다(completePurchase, 멱등).
 *
 * 주문 매칭 순서: ① 같은 토큰이 이미 묶인 주문 → ② 같은 SKU의 최근 7일 pending/expired 주문(최신) →
 * ③ 없으면 SKU로 상품을 알 수 있을 때만 새 주문(성장패스 구간은 가격 SKU를 공유해 못 만든다 → NO_ORDER).
 *
 * ⚠ 다른 유저 보호(2026-09-24 감사): 기기의 listPurchases()는 **구글 계정** 단위라, 같은 기기에서 게임 계정을 바꾸면
 * 다른 게임 계정이 산 구매가 보인다. 이 유저가 구매 시각 근처([구매−6시간 10분, 구매+5분])에 이 상품 결제창을 연 적이 없는데
 * **다른 유저**가 구매 직전([구매−30분, 구매+5분])에 연 토큰 없는 미완 주문이 있으면 그 사람의 구매일 수 있다 — ②·③으로 지급하지 않고 경보만 남긴다
 * (기기는 소모하지 않으므로 RTDN이 주인 주문을 찾아 지급하거나, 운영자가 어드민 도구로 처리한다).
 */
type CompleteFailCode = Extract<CompleteResult, { ok: false }>['code'];
export type RecoverResult =
  | { ok: true; already: boolean; paymentId: string }
  /**
   * CANCELLED = 구글이 취소·환불됐다고 답한 구매(지급 없음, 클라가 기기 consume으로 잠김만 푼다).
   * PENDING = 구글 쪽 결제 보류(편의점 결제 등) — 손대지 않는다. NOT_FOUND = 그 SKU의 구매가 아님.
   */
  | { ok: false; code: 'UNKNOWN_SKU' | 'NO_ORDER' | 'CANCELLED' | 'PENDING' | 'NOT_FOUND' | CompleteFailCode };

const LOOKBACK_DAYS = 7;

export async function recoverPlayPurchase(
  userId: string,
  serverId: number,
  sku: string,
  purchaseToken: string,
): Promise<RecoverResult> {
  if (!isKnownPlaySku(sku)) return { ok: false, code: 'UNKNOWN_SKU' };

  // 구글 권위부터 — 상태에 따라 갈린다. 보류(2)는 손대지 않고, 취소(1)는 지급 없이 잠김만 풀게 한다.
  // 다른 SKU의 토큰이면 조회 경로가 404(PlayApiError)로 던진다.
  let g: PlayProductPurchase;
  try {
    g = await getPlayProductPurchase(sku, purchaseToken);
  } catch (e) {
    // 토큰 발급 실패('token ' 접두 — 서비스 계정 키 사고)는 구매 문제가 아니다 — NOT_FOUND로 삼키지 않고 던져 재시도에 맡긴다.
    if (e instanceof PlayApiError && !e.message.startsWith('token ') && (e.status === 404 || e.status === 400)) return { ok: false, code: 'NOT_FOUND' };
    throw e;
  }
  const state = g.purchaseState;
  // 보류(2)는 손대지 않는다 — 대개 화면의 첫 검증이 토큰을 주문에 묶어 두었고, 아니어도 결제가 끝나면 완료 알림(RTDN)·다음 복구가 지급한다.
  // ⚠ 이 줄이 없으면 아래 'state !== 0 → CANCELLED'가 보류까지 잡아 기기가 보류 중인 구매를 소모해 버린다(2026-09-24 검수에서 발각).
  if (state === 2) return { ok: false, code: 'PENDING' };
  if (state !== 0) return { ok: false, code: 'CANCELLED' };

  // ① 토큰이 이미 묶인 주문(본인 것만) — 미완 주문만 다시 시도. paid·refunded 등 끝난 주문은 손대지 않는다
  //   (completePurchase는 전이가 없어도 ok를 돌려주므로 여기서 걸러야 "반영됐어요"가 헛뜨지 않는다).
  const [bound] = await db
    .select({ paymentId: iapOrders.portoneOrderId, status: iapOrders.status })
    .from(iapOrders)
    .where(and(eq(iapOrders.userId, userId), eq(iapOrders.playPurchaseToken, purchaseToken)))
    .limit(1);
  if (bound) {
    if (bound.status === 'pending' || bound.status === 'expired') return finish(bound.paymentId, userId, purchaseToken);
    return { ok: true, already: true, paymentId: bound.paymentId };
  }

  // ⓪ 이 토큰이 **다른 유저** 주문에 이미 묶였으면(보류 선결합·지급 후 소모 실패) 이 유저 몫이 아니다 — 새 주문을 만들어
  //   남의 복구 창·RTDN 후보를 어지럽히지 않고 끝낸다(completePurchase도 TOKEN_USED로 막지만 쓰레기 주문이 남는다).
  const [boundElsewhere] = await db
    .select({ id: iapOrders.id })
    .from(iapOrders)
    .where(and(ne(iapOrders.userId, userId), eq(iapOrders.playPurchaseToken, purchaseToken)))
    .limit(1);
  if (boundElsewhere) return { ok: false, code: 'NO_ORDER' };

  // 구매 시각 창. 시각이 없으면(드묾) 지금을 구매 시각으로 본다(창이 넓어지진 않는다).
  //  · 본인 주문: RTDN과 같은 [구매−6시간 10분, 구매+5분] — 넓을수록 본인 복구가 잘 된다.
  //  · 다른 유저 주문: [구매−30분, 구매+5분] — 진짜 구매자는 결제 직전에 결제창을 열었으므로(다시 눌렀으면 그 뒤로 밀림) 이 안에
  //    든다. 넓히면 몇 시간 전에 버려진 남의 결제창 때문에 정상 복구가 막힌다(RTDN과 보수적인 방향이 반대).
  const pt = g.purchaseTimeMillis ? Number(g.purchaseTimeMillis) : Date.now();
  const ts = (ms: number) => sql`${new Date(ms).toISOString()}::timestamptz`;
  const winEnd = ts(pt + 5 * 60_000);
  const lastTry = sql`coalesce(${iapOrders.playCheckoutAt}, ${iapOrders.createdAt})`;
  // 주문을 한 시각이 아니라 [만든 시각, 마지막 결제 시도] 구간으로 보고 창과 겹치는지 본다 — 결과를 잃고 다시 구매를 누르면
  // 재사용 주문의 play_checkout_at이 구매 뒤로 밀리지만(createPlayOrder), 만든 시각은 구매 전이라 여전히 그 구매의 주문이다.
  const overlaps = sql<boolean>`(${iapOrders.createdAt} <= ${winEnd} and ${lastTry} >= ${ts(pt - RTDN_LOOKBACK_MS)})`;
  const overlapsNarrow = sql<boolean>`(${iapOrders.createdAt} <= ${winEnd} and ${lastTry} >= ${ts(pt - 30 * 60_000)})`;

  // ② 같은 SKU의 최근 미완 주문 — 창과 겹치는 주문 먼저, 그중 구매 전에 만든 주문 먼저(구매 뒤 같은 가격의 다른 성장패스 구간을
  //   눌러 생긴 주문을 고르지 않게), 그다음 마지막 결제 시도 순(0215: 가격 SKU를 공유하면 가장 최근에 결제창을 연 주문이 이 구매).
  const [pending] = await db
    .select({ paymentId: iapOrders.portoneOrderId })
    .from(iapOrders)
    .where(
      and(
        eq(iapOrders.userId, userId),
        eq(iapOrders.provider, 'play'),
        eq(iapOrders.playSku, sku),
        // 다른 토큰이 이미 묶인 주문(보류 선결합)은 제외 — 덮어쓰면 그 보류 결제가 주인을 잃는다(재검증 B-1).
        isNull(iapOrders.playPurchaseToken),
        inArray(iapOrders.status, ['pending', 'expired']),
        gte(lastTry, sql`now() - interval '${sql.raw(String(LOOKBACK_DAYS))} days'`),
      ),
    )
    .orderBy(desc(overlaps), desc(sql`${iapOrders.createdAt} <= ${ts(pt)}`), desc(lastTry))
    .limit(1);
  // 이 유저가 구매 시각 근처에 이 상품 결제창을 연 적이 없는데(상태·토큰 무관 — 같은 주문의 두 번째 구매도 본인으로 본다)
  // **다른 유저**가 구매 직전에 연 토큰 없는 미완 주문이 있으면, 같은 기기의 다른 게임 계정 구매일 수 있다.
  const [mine] = await db
    .select({ id: iapOrders.id })
    .from(iapOrders)
    .where(and(eq(iapOrders.userId, userId), eq(iapOrders.provider, 'play'), eq(iapOrders.playSku, sku), overlaps))
    .limit(1);
  if (!mine) {
    const others = await db
      .select({ paymentId: iapOrders.portoneOrderId })
      .from(iapOrders)
      .where(
        and(
          ne(iapOrders.userId, userId),
          eq(iapOrders.provider, 'play'),
          eq(iapOrders.playSku, sku),
          isNull(iapOrders.playPurchaseToken),
          inArray(iapOrders.status, ['pending', 'expired']),
          overlapsNarrow,
        ),
      )
      .limit(5);
    if (others.length > 0) {
      await raisePaymentAlert('PLAY_RTDN_UNMATCHED', {
        paymentId: `recover:${g.orderId ?? purchaseToken.slice(0, 16)}`,
        detail: `상점 복구: 구글 주문 ${g.orderId ?? '?'}(${sku})가 이 기기에 있지만 복구한 유저는 구매 시각 근처에 이 상품 결제창을 연 적이 없고, 다른 유저가 구매 직전에 연 미완 주문(${others.map((o) => o.paymentId).join(', ')})이 있다 — 같은 기기의 다른 게임 계정 구매일 수 있어 지급하지 않음. 완료 알림(RTDN)이 처리하지 못하면 콘솔에서 구매자 확인 뒤 /api/admin/play-complete-order로 지급(3일 안에 처리하지 않으면 구글 자동 환불).`,
        // 복구는 상점을 열 때마다 돈다 — 해결 처리 뒤 같은 구매로 다시 울리지 않게.
        onceEver: true,
      });
      return { ok: false, code: 'NO_ORDER' };
    }
  }
  if (pending) return finish(pending.paymentId, userId, purchaseToken);

  // ③ 주문이 없으면 SKU로 상품을 되돌릴 수 있을 때만 새 주문.
  const productId = productIdForPlaySku(sku);
  if (!productId) return { ok: false, code: 'NO_ORDER' };
  try {
    const o = await createPlayOrder(userId, serverId, productId);
    return finish(o.paymentId, userId, purchaseToken);
  } catch (e) {
    if (e instanceof PurchaseError) return { ok: false, code: 'NO_ORDER' };
    throw e;
  }
}

async function finish(paymentId: string, userId: string, token: string): Promise<RecoverResult> {
  const r = await completePurchase(paymentId, userId, { playPurchaseToken: token });
  if (r.ok) return { ok: true, already: r.already, paymentId };
  return { ok: false, code: r.code };
}
