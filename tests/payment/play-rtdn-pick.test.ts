import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/db/client', () => ({ db: {} }));

import { pickRtdnCandidate } from '@/lib/payment/play-rtdn';

const T = Date.parse('2026-09-23T15:24:06Z');
const row = (id: string, iso: string) => ({ paymentId: id, createdAt: new Date(iso) });

describe('RTDN 주문 매칭 — 정확히 1건일 때만', () => {
  it('구매 직전 주문 1건이면 그 주문', () => {
    expect(pickRtdnCandidate([row('a', '2026-09-23T15:24:00Z')], T)?.paymentId).toBe('a');
  });
  it('창 밖 주문은 후보가 아니다(15분 넘게 전·2분 넘게 뒤)', () => {
    expect(pickRtdnCandidate([row('old', '2026-09-23T15:08:00Z'), row('late', '2026-09-23T15:27:00Z')], T)).toBeNull();
  });
  it('창 안에 두 건이면 지급하지 않는다(경보로)', () => {
    expect(pickRtdnCandidate([row('a', '2026-09-23T15:23:00Z'), row('b', '2026-09-23T15:24:00Z')], T)).toBeNull();
  });
  it('후보가 없으면 null', () => {
    expect(pickRtdnCandidate([], T)).toBeNull();
  });
});
