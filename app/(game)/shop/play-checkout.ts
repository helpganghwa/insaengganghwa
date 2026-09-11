import { isAppSession, isStandaloneDisplay, isTwaClient, usePlayBilling } from '@/lib/platform-client';
import { PLAY_BILLING_METHOD } from '@/lib/payment/play-sku';

import { createPlayOrderAction, verifyPlayPurchaseAction } from './actions';

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
type DigitalGoodsService = { getDetails(itemIds: string[]): Promise<DigitalGoodsItem[]> };
type DigitalGoodsWindow = Window & { getDigitalGoodsService?: (paymentMethod: string) => Promise<DigitalGoodsService> };

/**
 * API가 이 창에 **존재**하는가 — 존재만으로는 앱 안이라는 증거가 되지 않는다(아래 참조).
 * 결제 경로 판정에는 쓰지 말고, 프로브를 걸 가치가 있는지 판단하는 데만 쓴다.
 */
export function playBillingSupported(): boolean {
  if (typeof window === 'undefined') return false;
  return typeof (window as DigitalGoodsWindow).getDigitalGoodsService === 'function' && 'PaymentRequest' in window;
}

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
 * 앱 표식(세션 표식 또는 쿠키+standalone)만으로 Play가 확정되면 프로브를 건너뛴다. 결과가 같을 뿐
 * 아니라, 앱 안에서 프로브가 실패하더라도 포트원으로 새면 안 되기 때문이다(구글 정책).
 */
export async function shouldUsePlayBilling(): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  const facts = { twaCookie: isTwaClient(), standalone: isStandaloneDisplay(), appSession: isAppSession() };
  if (usePlayBilling({ ...facts, hasDigitalGoods: false })) return true;
  return usePlayBilling({ ...facts, hasDigitalGoods: await digitalGoodsAvailable() });
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

export async function runPlayCheckout(productId: string): Promise<PlayCheckoutResult> {
  // 서비스를 **주문 생성보다 먼저** 연다. 순서를 뒤집으면 미지원 환경에서 pending 주문만 쌓인다
  // (2026-09-12 실측 19건). 여기서 막히면 서버에 아무 흔적도 남지 않는다.
  if (!(await digitalGoodsAvailable())) {
    return { ok: false, reason: 'unsupported', message: UNSUPPORTED_MSG };
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
    response = await request.show();
  } catch (e) {
    const err = e as { name?: string; message?: string };
    if (err?.name === 'AbortError') return { ok: false, reason: 'cancel', code: 'ABORT' };
    // 'unsupported context'는 앱 밖에서 Digital Goods를 부를 때 크롬이 주는 말이다 — 날것 그대로
    // 유저에게 보이면 안 된다(2026-09-12 실제 노출).
    if (err?.name === 'NotSupportedError' || /not supported|unsupported|digital goods/i.test(err?.message ?? '')) {
      return { ok: false, reason: 'unsupported', message: UNSUPPORTED_MSG };
    }
    return { ok: false, reason: 'window', message: err?.message ?? '결제 시트를 열지 못했어요.' };
  }

  const token = (response.details as { purchaseToken?: string } | undefined)?.purchaseToken ?? '';
  if (!token) {
    await response.complete('fail').catch(() => undefined);
    return { ok: false, reason: 'window', message: '구매 토큰을 받지 못했어요. 결제가 됐다면 잠시 후 자동 반영됩니다.' };
  }
  const v = await verifyPlayPurchaseAction(paymentId, token).catch(() => null);
  if (!v) {
    // 전송 실패 — 구매는 성사됐을 수 있다. 시트는 성공으로 닫고(구글 쪽 구매 확정) 서버 정합화(cron·재시도)에 맡긴다.
    await response.complete('success').catch(() => undefined);
    return { ok: false, reason: 'verify', code: 'NETWORK' };
  }
  await response.complete(v.status === 'success' ? 'success' : 'fail').catch(() => undefined);
  if (v.status !== 'success') return { ok: false, reason: 'verify', code: v.code };
  return { ok: true, already: v.already, paymentId };
}
