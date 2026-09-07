import type { PlayCheckoutResult } from './play-checkout';

import { createAppleOrderAction, verifyAppleTransactionAction } from './actions';

/**
 * 앱스토어 앱(Capacitor) 안 결제 — StoreKit 2(docs/APPSTORE.md §3.3).
 * 흐름: 서버 주문 생성(pending, 상품 ID·appAccountToken 확정) → 네이티브 결제 시트 → transactionId
 * → 서버 검증·지급 → finish(소모 확정). 반환 형태는 runCheckout(포트원)·runPlayCheckout(Play)과 같아
 * ShopTabs가 결과 처리를 공유한다.
 *
 * 네이티브 브리지: Capacitor 셸(mobile/ios)이 `window.__ganghwaIap`를 심는다(플러그인 종류와 무관한 최소
 * 인터페이스 — 웹 코드는 StoreKit 플러그인을 직접 모른다). 브리지가 없으면 'unsupported'(앱 밖·구버전).
 * 앱 안에서 포트원 결제창을 여는 일은 어떤 경우에도 없다(스토어 정책).
 */
export type AppleCheckoutResult = PlayCheckoutResult;

export type AppleIapBridge = {
  /** 스토어 표시 가격(현지 통화 포맷) — 상품 ID별. 실패 시 빈 배열. */
  getProducts(productIds: string[]): Promise<{ productId: string; displayPrice: string }[]>;
  /** 결제 시트. appAccountToken은 주문 UUID(서버가 거래와 주문을 묶는 열쇠). */
  purchase(
    productId: string,
    appAccountToken: string,
  ): Promise<
    | { state: 'purchased'; transactionId: string }
    | { state: 'cancelled' }
    | { state: 'pending' }
    | { state: 'failed'; message?: string }
  >;
  /** 서버 지급 뒤 거래 종료(소모성 확정). 실패해도 지급은 유지된다. */
  finish(transactionId: string): Promise<void>;
};

type BridgeWindow = Window & { __ganghwaIap?: AppleIapBridge };

export function appleBillingSupported(): boolean {
  if (typeof window === 'undefined') return false;
  const b = (window as BridgeWindow).__ganghwaIap;
  return !!b && typeof b.purchase === 'function';
}

/** 표시 가격(스토어 등록가) — 실패하면 null(카탈로그 KRW로 표시). */
export async function applePriceLabel(productId: string): Promise<string | null> {
  try {
    const b = (window as BridgeWindow).__ganghwaIap;
    if (!b) return null;
    const [p] = await b.getProducts([productId]);
    return p?.displayPrice ?? null;
  } catch {
    return null;
  }
}

export async function runAppleCheckout(productId: string): Promise<AppleCheckoutResult> {
  const bridge = (window as BridgeWindow).__ganghwaIap;
  if (!bridge || typeof bridge.purchase !== 'function') {
    return { ok: false, reason: 'unsupported', message: 'App Store 앱에서만 결제할 수 있어요. 앱을 최신 버전으로 업데이트해 주세요.' };
  }

  const created = await createAppleOrderAction(productId);
  if (created.status !== 'success') return { ok: false, reason: 'create', code: created.code };
  const { paymentId, productId: storeProductId, appAccountToken } = created.order;

  let purchase: Awaited<ReturnType<AppleIapBridge['purchase']>>;
  try {
    purchase = await bridge.purchase(storeProductId, appAccountToken);
  } catch (e) {
    return { ok: false, reason: 'window', message: (e as Error)?.message || '결제 시트를 열지 못했어요.' };
  }
  if (purchase.state === 'cancelled') return { ok: false, reason: 'cancel' };
  if (purchase.state === 'pending') {
    // 승인 대기(가족 공유 '구입 요청' 등) — 승인되면 앱 재진입 시 StoreKit이 거래를 다시 전달하고,
    // 셸이 같은 appAccountToken으로 검증을 재요청한다(docs/APPSTORE.md §3.5).
    return { ok: false, reason: 'window', message: '결제 승인을 기다리고 있어요. 승인되면 자동으로 지급됩니다.' };
  }
  if (purchase.state === 'failed') return { ok: false, reason: 'window', message: purchase.message || '결제에 실패했어요.' };

  const verified = await verifyAppleTransactionAction(paymentId, purchase.transactionId);
  if (verified.status !== 'success') return { ok: false, reason: 'verify', code: verified.code };
  // 소모 확정 — 실패해도 지급은 이미 끝났다(다음 앱 실행 때 StoreKit이 미종료 거래를 다시 넘기면 already로 흡수).
  await bridge.finish(purchase.transactionId).catch(() => undefined);
  return { ok: true, already: verified.already, paymentId };
}
