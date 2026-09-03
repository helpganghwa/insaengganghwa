/**
 * Google Play 인앱 상품(SKU) 매핑 — docs/PLAYSTORE.md §4. 순수 모듈(클라·서버·테스트 공용).
 *
 * SKU는 **가격만** 담당한다. 무엇을 지급할지는 주문(iap_orders.product_code)이 정하므로
 * 성장패스 구간(bp_enhance_N/bp_transcend_N)은 가격이 같은 구간끼리 SKU를 공유한다
 * (9,900 + 10,000×N, 상한 59,900 → 6종). Play Console 가격은 이 표와 같아야 하며 부가세 포함 KRW.
 */
import { bpSegmentPriceKrw, BP_SEGMENT_PRICE_CAP_KRW } from '@/lib/game/balance';
import { CASH, DIAMONDS, FIRST_SPECIAL, PREMIUM } from '@/lib/game/shop/catalog';

/** PaymentRequest / Digital Goods API 결제 수단 식별자(고정값). */
export const PLAY_BILLING_METHOD = 'https://play.google.com/billing';

const BP_RE = /^bp_(enhance|transcend)_(\d+)$/;

/** 웹 productId → Play SKU. 모르는 상품이면 null(서버 createPlayOrder가 UNKNOWN_PRODUCT로 거부). */
export function playSkuFor(productId: string): string | null {
  const bp = BP_RE.exec(productId);
  if (bp) {
    const idx = Number(bp[2]);
    if (!Number.isInteger(idx) || idx < 0) return null;
    return `bp_${bpSegmentPriceKrw(bp[1] as 'enhance' | 'transcend', idx)}`;
  }
  if (productId === PREMIUM.id) return 'premium';
  if (productId === FIRST_SPECIAL.id) return 'first_special';
  if (DIAMONDS.some((d) => d.id === productId)) return `dia_${productId}`;
  for (const list of Object.values(CASH)) if (list.some((c) => c.id === productId)) return `cash_${productId}`;
  return null;
}

/** Play Console에 등록할 SKU 전체(22종) — 문서·검증 스크립트용. 이름은 콘솔 표시명(유저에게 보임). */
export function playSkuCatalog(): { sku: string; krw: number; name: string }[] {
  const out: { sku: string; krw: number; name: string }[] = [];
  for (const list of Object.values(CASH)) for (const c of list) out.push({ sku: `cash_${c.id}`, krw: c.krw, name: c.name });
  for (const d of DIAMONDS) out.push({ sku: `dia_${d.id}`, krw: d.krw, name: `다이아 ${d.total.toLocaleString('ko-KR')}` });
  out.push({ sku: 'premium', krw: PREMIUM.krw, name: '성장 프리미엄' });
  out.push({ sku: 'first_special', krw: FIRST_SPECIAL.krw, name: '인생 특가 패키지' });
  const seen = new Set<number>();
  for (let i = 0; ; i++) {
    const krw = bpSegmentPriceKrw('enhance', i);
    if (seen.has(krw)) break;
    seen.add(krw);
    out.push({ sku: `bp_${krw}`, krw, name: '성장 패스 구간' });
    if (krw >= BP_SEGMENT_PRICE_CAP_KRW) break;
  }
  return out;
}
