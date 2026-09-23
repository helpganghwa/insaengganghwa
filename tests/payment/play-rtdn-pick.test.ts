import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/db/client', () => ({ db: {} }));

import { pickRtdnCandidate } from '@/lib/payment/play-rtdn';

const row = (id: string, status: string, hasToken = false) => ({ paymentId: id, userId: 'u', status, hasToken });

describe('RTDN 판정 — 범위 안 같은 SKU 주문이 정확히 1건이고 토큰 없는 미완일 때만', () => {
  it('미완 1건이면 그 주문', () => {
    expect(pickRtdnCandidate([row('a', 'pending')])?.paymentId).toBe('a');
    expect(pickRtdnCandidate([row('a', 'expired')])?.paymentId).toBe('a');
  });
  it('주문이 2건 이상이면(상태와 무관) 지급하지 않는다', () => {
    expect(pickRtdnCandidate([row('mine', 'paid', true), row('other', 'pending')])).toBeNull();
    expect(pickRtdnCandidate([row('a', 'pending'), row('b', 'pending')])).toBeNull();
  });
  it('1건이어도 이미 토큰이 있거나 끝난 주문이면 지급하지 않는다', () => {
    expect(pickRtdnCandidate([row('a', 'paid', true)])).toBeNull();
    expect(pickRtdnCandidate([row('a', 'refunded', true)])).toBeNull();
    expect(pickRtdnCandidate([row('a', 'pending', true)])).toBeNull();
  });
  it('0건이면 null', () => {
    expect(pickRtdnCandidate([])).toBeNull();
  });
});
