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

export function playBillingSupported(): boolean {
  if (typeof window === 'undefined') return false;
  return typeof (window as DigitalGoodsWindow).getDigitalGoodsService === 'function' && 'PaymentRequest' in window;
}

/** 결제 경로 선택 — 사실만 모아 순수 규칙(usePlayBilling)에 넘긴다. 규칙과 근거는 그쪽 주석 참조. */
export function shouldUsePlayBilling(): boolean {
  if (typeof window === 'undefined') return false;
  return usePlayBilling({
    hasDigitalGoods: playBillingSupported(),
    twaCookie: isTwaClient(),
    standalone: isStandaloneDisplay(),
    appSession: isAppSession(),
  });
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

export async function runPlayCheckout(productId: string): Promise<PlayCheckoutResult> {
  if (!playBillingSupported()) {
    return { ok: false, reason: 'unsupported', message: '플레이스토어에서 설치한 앱에서만 결제할 수 있어요.' };
  }
  const r = await createPlayOrderAction(productId).catch(() => null);
  if (!r) return { ok: false, reason: 'create', code: 'NETWORK' };
  if (r.status !== 'success') return { ok: false, reason: 'create', code: r.code };
  const { paymentId, sku, orderName, amountKrw } = r.order;

  let response: PaymentResponse;
  try {
    // Digital Goods API 초기화 — 지원 여부를 여기서 최종 확인(getDigitalGoodsService가 reject하면 미지원).
    await (window as DigitalGoodsWindow).getDigitalGoodsService!(PLAY_BILLING_METHOD);
    const request = new PaymentRequest(
      [{ supportedMethods: PLAY_BILLING_METHOD, data: { sku } }],
      { total: { label: orderName, amount: { currency: 'KRW', value: String(amountKrw) } } },
    );
    response = await request.show();
  } catch (e) {
    const err = e as { name?: string; message?: string };
    if (err?.name === 'AbortError') return { ok: false, reason: 'cancel', code: 'ABORT' };
    if (err?.name === 'NotSupportedError' || /not supported|digital goods/i.test(err?.message ?? '')) {
      return { ok: false, reason: 'unsupported', message: '플레이스토어에서 설치한 앱에서만 결제할 수 있어요.' };
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
