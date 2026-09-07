import type { PlayCheckoutResult } from './play-checkout';

/**
 * 앱스토어 앱(Capacitor) 안 결제 — StoreKit 2(docs/APPSTORE.md §3.3).
 * 반환 형태는 runCheckout(포트원)·runPlayCheckout(Play)과 같아 ShopTabs가 결과 처리를 공유한다.
 * 3.3(서버 검증·플러그인 연결) 전까지는 'unsupported'로 안내만 한다 — 앱 안에서 포트원 결제창을
 * 여는 일은 어떤 경우에도 없어야 한다(스토어 정책).
 */
export type AppleCheckoutResult = PlayCheckoutResult;

export function appleBillingSupported(): boolean {
  if (typeof window === 'undefined') return false;
  return typeof (window as Window & { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform === 'function';
}

export async function runAppleCheckout(_productId: string): Promise<AppleCheckoutResult> {
  return { ok: false, reason: 'unsupported', message: 'App Store 결제는 준비 중이에요. 잠시만 기다려 주세요.' };
}
