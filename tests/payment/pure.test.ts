import { describe, expect, it } from 'vitest';

import { paidProduct, shopGrant, DIAMONDS, PREMIUM } from '@/lib/game/shop/catalog';
import { parseBpProduct } from '@/lib/payment/purchase';

/**
 * 머니경로 — 순수 불변식(PAYMENT-SAFETY.md §5). DB 불필요, 항상 실행.
 *
 * 결제 금액은 서버 권위(클라가 보낸 금액 무시) — paidProduct.krw가 유일 진실 원천이고
 * createOrder/completePurchase가 이 값으로만 주문·검증한다. 이 표가 바뀌면 가격이 바뀐 것이므로
 * 의도치 않은 드리프트를 테스트가 잡는다. (확률공시·상품가 동시 갱신 강제)
 */
describe('머니경로 — 상품 가격 권위(paidProduct)', () => {
  it('다이아 충전 가격이 카탈로그와 일치', () => {
    expect(paidProduct('starter')?.krw).toBe(1500);
    expect(paidProduct('small')?.krw).toBe(6000);
    expect(paidProduct('medium')?.krw).toBe(13000);
    expect(paidProduct('large')?.krw).toBe(28000);
    expect(paidProduct('mega')?.krw).toBe(68000);
  });

  it('프리미엄·현금팩 가격 일치', () => {
    expect(paidProduct('premium')?.krw).toBe(14900);
    expect(paidProduct('d1')?.krw).toBe(1200);
    expect(paidProduct('w2')?.krw).toBe(9900);
    expect(paidProduct('m3')?.krw).toBe(39900);
  });

  it('결제 불가 상품(보급상자·미존재)은 null', () => {
    expect(paidProduct('box_daily')).toBeNull();
    expect(paidProduct('nonexistent')).toBeNull();
  });

  it('불변식: 결제 가능 상품은 모두 지급 정의를 가진다(purchasable ⟹ grantable)', () => {
    const paidIds = [PREMIUM.id, ...DIAMONDS.map((d) => d.id)];
    for (const id of paidIds) {
      expect(paidProduct(id), `paidProduct(${id})`).not.toBeNull();
      expect(shopGrant(id), `shopGrant(${id})`).not.toBeNull();
    }
  });
});

describe('머니경로 — 지급량 권위(shopGrant)', () => {
  it('다이아 충전은 다이아만(상자 0)', () => {
    expect(shopGrant('starter')).toEqual({ diamond: 300, boxes: 0 });
    expect(shopGrant('mega')).toEqual({ diamond: 16000, boxes: 0 });
  });

  it('현금팩은 다이아+상자', () => {
    expect(shopGrant('d1')).toEqual({ diamond: 290, boxes: 3 });
  });

  it('프리미엄은 즉시분만 반환(일일분 제외)', () => {
    expect(shopGrant('premium')).toEqual(PREMIUM.instant);
  });
});

describe('머니경로 — 배틀패스 상품코드 파싱(parseBpProduct)', () => {
  it('유효 코드 파싱', () => {
    expect(parseBpProduct('bp_enhance_0')).toEqual({ type: 'enhance', segmentIndex: 0 });
    expect(parseBpProduct('bp_transcend_5')).toEqual({ type: 'transcend', segmentIndex: 5 });
  });

  it('비배틀패스/오염 코드는 null(분기 오인 방지)', () => {
    expect(parseBpProduct('starter')).toBeNull();
    expect(parseBpProduct('bp_enhance_')).toBeNull();
    expect(parseBpProduct('bp_unknown_1')).toBeNull();
    expect(parseBpProduct('bp_enhance_1x')).toBeNull();
  });
});
