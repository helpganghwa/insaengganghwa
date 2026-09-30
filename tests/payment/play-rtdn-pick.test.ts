import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/db/client', () => ({ db: {} }));

import { pickRtdnCandidate } from '@/lib/payment/play-rtdn';

const T = 1_000_000_000_000; // 구매 시각
const row = (id: string, status: string, o: { hasToken?: boolean; userId?: string; productCode?: string; serverId?: number; lastTryMs?: number } = {}) => ({
  paymentId: id,
  userId: o.userId ?? 'u',
  status,
  hasToken: o.hasToken ?? false,
  productCode: o.productCode ?? 'bp_enhance_0',
  serverId: o.serverId ?? 1,
  lastTryMs: o.lastTryMs ?? T - 60_000,
});

describe('RTDN 판정 — 범위 안 주문이 모두 한 유저 것이고 미완 주문의 상품이 하나로 정해질 때만', () => {
  it('미완 1건이면 그 주문', () => {
    expect(pickRtdnCandidate([row('a', 'pending')], T)?.paymentId).toBe('a');
    expect(pickRtdnCandidate([row('a', 'expired')], T)?.paymentId).toBe('a');
  });
  it('같은 유저가 결제창을 여러 번 연 경우 — 구매 직전에 연 결제창(09-30 베르 사례)', () => {
    const rows = [
      row('first', 'expired', { lastTryMs: T - 7_000 }), // 구매 7초 전에 연 창 = 실제로 결제한 창
      row('second', 'expired', { lastTryMs: T + 44_000 }),
      row('third', 'pending', { lastTryMs: T + 54_000 + 60_000 }),
    ];
    expect(pickRtdnCandidate(rows, T)?.paymentId).toBe('first');
  });
  it('같은 유저의 이미 지급된 주문(토큰 있음)은 건너뛰고 미완 주문으로 — 토큰이 안 묶였으니 그 결제는 지급된 주문의 것이 아니다', () => {
    expect(pickRtdnCandidate([row('paid', 'paid', { hasToken: true }), row('open', 'pending')], T)?.paymentId).toBe('open');
    // 다른 구간(상품)을 이미 산 뒤 새 구간의 미완 주문 1건
    expect(pickRtdnCandidate([row('p1', 'paid', { hasToken: true, productCode: 'bp_enhance_1' }), row('p0', 'pending')], T)?.paymentId).toBe('p0');
  });
  it('같은 유저·같은 상품이어도 서버가 둘이면 지급하지 않는다', () => {
    expect(pickRtdnCandidate([row('s1', 'pending', { serverId: 1 }), row('s2', 'pending', { serverId: 2 })], T)).toBeNull();
  });
  it('다른 유저 주문이 하나라도 있으면 지급하지 않는다(누구 구매인지 모름)', () => {
    expect(pickRtdnCandidate([row('mine', 'paid', { hasToken: true }), row('other', 'pending', { userId: 'v' })], T)).toBeNull();
    expect(pickRtdnCandidate([row('a', 'pending'), row('b', 'pending', { userId: 'v' })], T)).toBeNull();
  });
  it('같은 유저여도 미완 주문의 상품이 둘 이상이면(가격 SKU 공유 구간) 지급하지 않는다', () => {
    expect(pickRtdnCandidate([row('a', 'pending', { productCode: 'bp_enhance_0' }), row('b', 'pending', { productCode: 'bp_transcend_0' })], T)).toBeNull();
  });
  it('미완 주문이 없으면(모두 토큰 있음·끝남) 지급하지 않는다', () => {
    expect(pickRtdnCandidate([row('a', 'paid', { hasToken: true })], T)).toBeNull();
    expect(pickRtdnCandidate([row('a', 'refunded', { hasToken: true })], T)).toBeNull();
    expect(pickRtdnCandidate([row('a', 'pending', { hasToken: true })], T)).toBeNull();
  });
  it('구매 시각(+5초) 이전에 연 결제창이 없으면 추정하지 않는다(진짜 주문이 후보에 없다)', () => {
    expect(pickRtdnCandidate([row('a', 'pending', { lastTryMs: T + 120_000 }), row('b', 'pending', { lastTryMs: T + 300_000 })], T)).toBeNull();
    expect(pickRtdnCandidate([row('a', 'pending', { lastTryMs: T + 4_000 })], T)?.paymentId).toBe('a'); // 시계 오차 5초 안
  });
  it('0건이면 null', () => {
    expect(pickRtdnCandidate([], T)).toBeNull();
  });
});
