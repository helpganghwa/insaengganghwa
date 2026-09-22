import { describe, expect, it } from 'vitest';

import { isKnownPlaySku, playSkuCatalog, playSkuFor, productIdForPlaySku } from '@/lib/payment/play-sku';

/**
 * Play 결제 복구(2026-09-22)가 쓰는 역매핑 — 기기 listPurchases의 SKU로 상품을 되돌린다.
 * 성장패스 구간은 가격 SKU를 공유하므로 되돌릴 수 없어야 하고(주문이 있을 때만 복구), 나머지는 왕복이 맞아야 한다.
 */
describe('Play SKU 역매핑', () => {
  it('카탈로그의 상점 SKU는 productId로 되돌아가고, 다시 SKU로 가면 같다', () => {
    const skus = playSkuCatalog().map((c) => c.sku);
    expect(skus.length).toBeGreaterThanOrEqual(20);
    for (const sku of skus) {
      expect(isKnownPlaySku(sku)).toBe(true);
      const pid = productIdForPlaySku(sku);
      if (sku.startsWith('bp_')) {
        expect(pid).toBeNull();
      } else {
        expect(pid).not.toBeNull();
        expect(playSkuFor(pid!)).toBe(sku);
      }
    }
  });

  it('모르는 SKU는 거부', () => {
    expect(isKnownPlaySku('dia_nope')).toBe(false);
    expect(productIdForPlaySku('dia_nope')).toBeNull();
    expect(productIdForPlaySku('cash_')).toBeNull();
    expect(productIdForPlaySku('')).toBeNull();
  });
});
