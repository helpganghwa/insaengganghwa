import { detectClientPlatform, isAppSession, usePlayBilling } from '@/lib/platform-client';
import { PLAY_BILLING_METHOD } from '@/lib/payment/play-sku';

import { createPlayOrderAction, recoverPlayPurchaseAction, verifyPlayPurchaseAction } from './actions';

/**
 * 플레이스토어 앱(TWA) 안 결제 — Digital Goods API + PaymentRequest(docs/PLAYSTORE.md §3.2).
 * 흐름: 서버 주문 생성(pending, SKU 확정) → Play 결제 시트 → purchaseToken → 서버 검증·지급·소모.
 * 반환 형태는 runCheckout(포트원)과 같아 ShopTabs가 결과 처리를 공유한다.
 *  - 'unsupported': 브라우저·구버전 크롬 등 Digital Goods API가 없는 환경(앱 밖에서 twa 쿠키만 있는 경우 포함).
 */
export type PlayCheckoutResult =
  | { ok: true; already: boolean; paymentId: string }
  | { ok: false; reason: 'create' | 'verify' | 'cancel'; code?: string }
  | { ok: false; reason: 'window'; message: string }
  | { ok: false; reason: 'unsupported'; message: string };

type DigitalGoodsItem = { itemId: string; title: string; price: { currency: string; value: string } };
type DigitalGoodsPurchase = { itemId: string; purchaseToken: string };
type DigitalGoodsService = {
  getDetails(itemIds: string[]): Promise<DigitalGoodsItem[]>;
  /** 이 앱·계정의 미소모(미확정) 구매 — Digital Goods API 2.1. */
  listPurchases?(): Promise<DigitalGoodsPurchase[]>;
  /** 기기에서 직접 소모 — 서버가 지급을 거부한(취소·환불) 구매의 "already own" 잠김을 푼다. */
  consume?(purchaseToken: string): Promise<void>;
};
type DigitalGoodsWindow = Window & { getDigitalGoodsService?: (paymentMethod: string) => Promise<DigitalGoodsService> };

/**
 * Digital Goods 서비스가 실제로 **열리는가**.
 *
 * ⚠ 안드로이드 크롬은 일반 탭에서도 `getDigitalGoodsService`를 노출한다. 함수가 있다고 앱 안인 것이
 * 아니다 — 일반 탭에서 호출하면 "unsupported context"로 reject된다. 존재 여부로 판정하던 동안
 * **안드로이드 크롬 웹 유저가 전부 Play 결제로 갈려 결제가 통째로 실패했다**(2026-09-11 16:01 ~
 * 09-12, 실패 주문 19건). 그래서 존재가 아니라 열리는지로 판정한다.
 */
export type DigitalGoodsHost = {
  getDigitalGoodsService?: (paymentMethod: string) => Promise<unknown>;
  PaymentRequest?: unknown;
};

export async function digitalGoodsAvailable(host?: DigitalGoodsHost): Promise<boolean> {
  const w = host ?? (typeof window === 'undefined' ? null : (window as unknown as DigitalGoodsHost));
  if (!w) return false;
  if (typeof w.getDigitalGoodsService !== 'function' || typeof w.PaymentRequest !== 'function') return false;
  try {
    await w.getDigitalGoodsService(PLAY_BILLING_METHOD);
    return true;
  } catch {
    return false;
  }
}

/**
 * 결제 경로 선택 — 사실만 모아 순수 규칙(usePlayBilling)에 넘긴다. 규칙과 근거는 그쪽 주석 참조.
 *
 * 앱 세션 표식만으로 Play가 확정되면 프로브를 건너뛴다. 결과가 같을 뿐 아니라, 앱 안에서 프로브가
 * 실패하더라도 포트원으로 새면 안 되기 때문이다(구글 정책).
 */
export async function shouldUsePlayBilling(): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  const appSession = isAppSession();
  if (usePlayBilling({ appSession, hasDigitalGoods: false })) return true;
  return usePlayBilling({ appSession, hasDigitalGoods: await digitalGoodsAvailable() });
}

/** 표시 가격(콘솔 등록가) — 실패하면 null(카탈로그 KRW로 표시). 결제 시트가 어차피 실제 가격을 보여준다. */
export async function playPriceLabel(sku: string): Promise<string | null> {
  try {
    const w = window as DigitalGoodsWindow;
    if (!w.getDigitalGoodsService) return null;
    const svc = await w.getDigitalGoodsService(PLAY_BILLING_METHOD);
    const [item] = await svc.getDetails([sku]);
    if (!item) return null;
    return `${Number(item.price.value).toLocaleString('ko-KR')}원`;
  } catch {
    return null;
  }
}

const UNSUPPORTED_MSG = '플레이스토어에서 설치한 앱에서만 결제할 수 있어요.';
// 앱 안 결제는 앱 안에서 해결한다(2026-09-23 사용자 결정) — 브라우저 결제나 다른 앱 설치를 권하지 않는다.
const SHEET_UNAVAILABLE_MSG = '구글 플레이 결제창을 열지 못했어요. 잠시 후 다시 시도해 주세요.';
/**
 * 삼성 인터넷이 앱을 띄운 경우(2026-09-23 실측: 실패 76회 전부 SamsungBrowser/28·30 UA, 성공은 Chrome).
 * 기본 브라우저가 삼성 인터넷이면 안드로이드가 Play 앱(TWA)을 삼성 인터넷으로 열고, 삼성 인터넷은 Digital Goods 상품 조회까지는
 * 되지만 구글 결제창(PaymentRequest)을 열지 못한다. 근본 해결은 앱이 TWA 제공자를 Chrome으로 고정하는 것(mobile/android
 * LauncherActivity.createTwaLauncher, 앱 업데이트 필요). 그때까지는 시트를 열지 않고 업데이트 안내만 한다.
 */
const NON_CHROME_HOST_MSG =
  '지금 이 기기에서는 앱 안 결제창이 열리지 않는 문제가 있어요. 이를 고친 앱 업데이트를 준비하고 있으니, 업데이트가 나오면 다시 시도해 주세요.';
/** 삼성 인터넷·네이버 웨일이 띄운 앱 — 삼성은 결제창을 못 열고, 웨일은 결제창이 열려 청구까지 되지만 돌아올 때 화면을 새로
 *  불러 결과를 잃는다(2026-09-24 청구·미지급 1건). 1.0.1(크롬 우선) 전까지 둘 다 결제를 막는다. */
function hostedByNonChromeBrowser(): boolean {
  return /SamsungBrowser|Whale/i.test(navigator.userAgent);
}


/**
 * Play 결제 실패 기록(2026-09-22) — 결제 시트가 왜 실패했는지 서버에는 아무 흔적이 없었다(한 유저가
 * ₩68,000을 여덟 번 시도하고 전부 시트에서 끝났는데 이유를 알 수 없었다). client_errors에 남긴다.
 * 토큰·개인정보는 싣지 않는다. 실패해도 조용히 무시.
 */
function reportPlayCheckout(stage: string, sku: string, detail: { name?: string; message?: string; code?: string }): void {
  try {
    const parts = [`sku=${sku}`, `stage=${stage}`];
    if (detail.code) parts.push(`code=${detail.code}`);
    if (detail.name) parts.push(`name=${detail.name}`);
    if (detail.message) parts.push(`message=${detail.message.slice(0, 200)}`);
    const body = JSON.stringify({
      kind: 'play-checkout',
      message: parts.join(' '),
      url: location.pathname,
      ua: navigator.userAgent.slice(0, 200),
      platform: detectClientPlatform(),
    });
    if (navigator.sendBeacon) navigator.sendBeacon('/api/client-error', new Blob([body], { type: 'application/json' }));
    else void fetch('/api/client-error', { method: 'POST', headers: { 'content-type': 'application/json' }, body, keepalive: true });
  } catch {
    // 기록 실패는 무시.
  }
}

export type PlayRecoverSummary = { checked: number; granted: number; cleared: number; failed: number };

/**
 * 결제 복구(2026-09-22) — 앱에서 상점을 열 때 한 번. 기기에 남은 미확정 구매를 서버에 보내 다시
 * 검증·지급·소모한다. 서버가 CANCELLED(구글이 취소·환불됐다고 답함)면 기기에서 소모해
 * "already own" 잠김을 푼다(지급 없이 잠김만 해제 — 서버가 구글에 재확인한 결과라 안전). PENDING(보류)은 건드리지 않는다.
 * 앱 밖·미지원 환경이면 아무것도 하지 않는다.
 */
export async function recoverPlayPurchases(): Promise<PlayRecoverSummary> {
  const out: PlayRecoverSummary = { checked: 0, granted: 0, cleared: 0, failed: 0 };
  if (typeof window === 'undefined') return out;
  const w = window as DigitalGoodsWindow;
  if (typeof w.getDigitalGoodsService !== 'function') return out;
  let svc: DigitalGoodsService;
  try {
    svc = await w.getDigitalGoodsService(PLAY_BILLING_METHOD);
  } catch {
    return out;
  }
  if (typeof svc.listPurchases !== 'function') return out;
  let purchases: DigitalGoodsPurchase[] = [];
  try {
    purchases = await svc.listPurchases();
  } catch (e) {
    const err = e as { name?: string; message?: string };
    reportPlayCheckout('list', '-', { name: err?.name, message: err?.message });
    return out;
  }
  for (const p of purchases) {
    if (!p?.itemId || !p?.purchaseToken) continue;
    out.checked++;
    const r = await recoverPlayPurchaseAction(p.itemId, p.purchaseToken).catch(() => null);
    if (!r) {
      out.failed++;
      reportPlayCheckout('recover', p.itemId, { code: 'NETWORK' });
      continue;
    }
    if (r.status === 'success') {
      if (!r.already) out.granted++;
      continue;
    }
    // 구글 쪽 결제 보류(편의점 결제 등) — 건드리지 않는다. 결제가 끝나면 다음 진입에서 다시 온다.
    if (r.code === 'PENDING') continue;
    // 구글이 취소·환불됐다고 답한 구매 — 지급 없이 기기 소모로 잠김만 푼다(서버가 구글에 확인한 결과).
    if (r.code === 'CANCELLED' && typeof svc.consume === 'function') {
      try {
        await svc.consume(p.purchaseToken);
        out.cleared++;
      } catch (e) {
        out.failed++;
        reportPlayCheckout('consume', p.itemId, { name: (e as Error)?.name, message: (e as Error)?.message });
      }
      continue;
    }
    out.failed++;
    reportPlayCheckout('recover', p.itemId, { code: r.code });
  }
  return out;
}

export async function runPlayCheckout(productId: string): Promise<PlayCheckoutResult> {
  // 서비스를 **주문 생성보다 먼저** 연다. 순서를 뒤집으면 미지원 환경에서 pending 주문만 쌓인다
  // (2026-09-12 실측 19건). 여기서 막히면 서버에 아무 흔적도 남지 않는다.
  if (!(await digitalGoodsAvailable())) {
    return { ok: false, reason: 'unsupported', message: UNSUPPORTED_MSG };
  }
  // 호스트 판정도 주문 생성보다 먼저(2026-09-23 감사) — 삼성 인터넷·웨일은 결제를 끝까지 이어가지 못하니 서버 액션·pending 주문 없이 안내만.
  if (hostedByNonChromeBrowser()) {
    reportPlayCheckout('precheck', productId, { code: 'NON_CHROME_HOST' });
    return { ok: false, reason: 'window', message: NON_CHROME_HOST_MSG };
  }
  const r = await createPlayOrderAction(productId).catch(() => null);
  if (!r) return { ok: false, reason: 'create', code: 'NETWORK' };
  if (r.status !== 'success') return { ok: false, reason: 'create', code: r.code };
  const { paymentId, sku, orderName, amountKrw } = r.order;

  let response: PaymentResponse;
  try {
    const request = new PaymentRequest(
      [{ supportedMethods: PLAY_BILLING_METHOD, data: { sku } }],
      { total: { label: orderName, amount: { currency: 'KRW', value: String(amountKrw) } } },
    );
    // 시트 앞에 다른 await를 두지 않는다 — 대기가 길면 사용자 활성화가 만료돼 show()가 거부된다.
    response = await request.show();
  } catch (e) {
    const err = e as { name?: string; message?: string };
    // 거부는 전부 기록한다(2026-09-22) — 크롬은 유저 취소와 결제 앱 오류(상품 없음·판매자 미설정 등)에 같은
    // AbortError를 쓰고 메시지만 다르다("User closed the Payment Request UI" = 취소). 오늘 실유저 3명이
    // 1초 간격으로 47번 시도했는데 취소·미지원으로 분류돼 서버엔 흔적이 없었다.
    reportPlayCheckout('sheet', sku, { name: err?.name, message: err?.message });
    if (err?.name === 'AbortError') {
      // 유저가 닫은 것("User closed the Payment Request UI")과 결제 앱이 RESULT_CANCELED로 끝난 것은 조용히 취소로 둔다 —
      // Chrome은 유저 취소와 결제 앱 실패(상품 없음·미검증 앱 등)를 같은 RESULT_CANCELED로 주어 구분할 수 없고, 기록은 위에서
      // 이미 남겼다. "Invalid state."(삼성 인터넷 호스트) 같은 나머지 AbortError만 안내를 띄운다(2026-09-23 감사).
      if (/closed|cancel/i.test(err?.message ?? '')) return { ok: false, reason: 'cancel', code: 'ABORT' };
      return { ok: false, reason: 'window', message: SHEET_UNAVAILABLE_MSG };
    }
    // 'unsupported context'는 앱 밖에서 Digital Goods를 부를 때 크롬이 주는 말이다 — 날것 그대로
    // 유저에게 보이면 안 된다(2026-09-12 실제 노출).
    if (err?.name === 'NotSupportedError' || /not supported|unsupported|digital goods/i.test(err?.message ?? '')) {
      return { ok: false, reason: 'unsupported', message: UNSUPPORTED_MSG };
    }
    // 원문(영문)은 위 기록에만 남기고 유저에겐 한국어 안내만(2026-09-23 감사).
    return { ok: false, reason: 'window', message: SHEET_UNAVAILABLE_MSG };
  }

  const token = (response.details as { purchaseToken?: string } | undefined)?.purchaseToken ?? '';
  if (!token) {
    await response.complete('fail').catch(() => undefined);
    reportPlayCheckout('token', sku, { code: 'EMPTY' });
    return { ok: false, reason: 'window', message: '구매 토큰을 받지 못했어요. 결제가 됐다면 상점을 다시 열면 반영됩니다.' };
  }
  const v = await verifyPlayPurchaseAction(paymentId, token).catch(() => null);
  if (!v) {
    // 전송 실패 — 구매는 성사됐을 수 있다. 시트는 성공으로 닫고(구글 쪽 구매 확정) 다음 상점 진입의 복구(recoverPlayPurchases)에 맡긴다.
    await response.complete('success').catch(() => undefined);
    reportPlayCheckout('verify', sku, { code: 'NETWORK' });
    return { ok: false, reason: 'verify', code: 'NETWORK' };
  }
  // 검증 실패도 시트는 success로 닫는다(2026-09-22) — fail로 닫으면 구글이 구매를 실패로 표시하지만 소모성
  // 구매 자체는 남아 "already own"이 되고, 서버엔 토큰이 없어 손댈 수 없었다. 구매는 성사된 사실이므로
  // success로 닫고, 지급은 다음 상점 진입의 복구가 다시 시도한다(취소·환불이면 복구가 기기 소모로 잠김을 푼다).
  await response.complete('success').catch(() => undefined);
  if (v.status !== 'success') {
    reportPlayCheckout('verify', sku, { code: v.code });
    return { ok: false, reason: 'verify', code: v.code };
  }
  return { ok: true, already: v.already, paymentId };
}
