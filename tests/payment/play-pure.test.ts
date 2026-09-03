import { describe, expect, it } from 'vitest';

import { bpSegmentPriceKrw, BP_SEGMENT_PRICE_CAP_KRW } from '@/lib/game/balance';
import { CASH, DIAMONDS, FIRST_SPECIAL, PREMIUM, paidProduct } from '@/lib/game/shop/catalog';
import { playSkuCatalog, playSkuFor } from '@/lib/payment/play-sku';

// Play SKU 매핑(docs/PLAYSTORE.md §4) — SKU는 가격만 담당, 카탈로그 KRW와 1:1.
describe('play sku', () => {
  it('상점 상품 전부가 SKU를 가지며 카탈로그 가격과 일치한다', () => {
    const catalog = new Map(playSkuCatalog().map((s) => [s.sku, s.krw]));
    const ids = [
      ...Object.values(CASH).flatMap((l) => l.map((c) => c.id)),
      ...DIAMONDS.map((d) => d.id),
      PREMIUM.id,
      FIRST_SPECIAL.id,
    ];
    for (const id of ids) {
      const sku = playSkuFor(id);
      expect(sku, id).not.toBeNull();
      expect(catalog.get(sku!), `${id} → ${sku}`).toBe(paidProduct(id)!.krw);
    }
  });

  it('성장패스 구간은 가격이 같은 구간끼리 SKU를 공유하고 상한에서 멈춘다', () => {
    expect(playSkuFor('bp_enhance_0')).toBe('bp_9900');
    expect(playSkuFor('bp_transcend_1')).toBe('bp_19900');
    expect(playSkuFor('bp_enhance_5')).toBe(`bp_${BP_SEGMENT_PRICE_CAP_KRW}`);
    expect(playSkuFor('bp_enhance_40')).toBe(`bp_${BP_SEGMENT_PRICE_CAP_KRW}`);
    expect(playSkuFor('bp_enhance_3')).toBe(`bp_${bpSegmentPriceKrw('enhance', 3)}`);
  });

  it('모르는 상품·비정상 구간은 null', () => {
    expect(playSkuFor('nope')).toBeNull();
    expect(playSkuFor('bp_enhance_-1')).toBeNull();
    expect(playSkuFor('bp_enhance_x')).toBeNull();
  });

  it('콘솔 등록 목록은 22종·중복 없음', () => {
    const list = playSkuCatalog();
    expect(list.length).toBe(22);
    expect(new Set(list.map((s) => s.sku)).size).toBe(22);
    expect(list.every((s) => s.krw > 0 && /^[a-z0-9_]+$/.test(s.sku))).toBe(true);
  });
});
