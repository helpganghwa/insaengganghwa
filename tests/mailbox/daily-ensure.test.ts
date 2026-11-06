import { beforeEach, describe, expect, it, vi } from 'vitest';

// 일일 지급 보장 공용 실행기(2026-11-06 업데이트 18) — 순서·실패 안전·스로틀. DB 없이 지급 함수만 대역.
const calls: string[] = [];
vi.mock('@/lib/game/mailbox/daily', () => ({
  ensureDailyMail: vi.fn(async () => {
    calls.push('daily');
    return true;
  }),
}));
vi.mock('@/lib/game/cbt/grant', () => ({
  ensureCbtCarryover: vi.fn(async () => {
    calls.push('cbt');
  }),
}));
vi.mock('@/lib/game/mailbox/premium-daily', () => ({
  ensurePremiumDailyMailAll: vi.fn(async () => {
    calls.push('premium');
    return 0;
  }),
}));

const { ensureDailyGrants } = await import('@/lib/game/mailbox/daily-ensure');

let n = 0;
const uid = () => `00000000-0000-0000-0000-${String(++n).padStart(12, '0')}`;

describe('ensureDailyGrants', () => {
  beforeEach(() => {
    calls.length = 0;
  });

  it('레이아웃: 일일 보급·CBT를 셸 데이터보다 먼저, premiumDue가 참이면 프리미엄', async () => {
    const order: string[] = [];
    await ensureDailyGrants(uid(), 1, {
      kind: 'due',
      due: async () => {
        order.push(`due-after:${calls.join(',')}`);
        return true;
      },
    });
    expect(order).toEqual(['due-after:daily,cbt']);
    expect(calls).toEqual(['daily', 'cbt', 'premium']);
  });

  it('레이아웃: 셸 데이터가 실패해도(예외) 일일 보급은 이미 됐고 프리미엄은 시도한다', async () => {
    await ensureDailyGrants(uid(), 1, { kind: 'due', due: () => Promise.reject(new Error('layout fail')) });
    expect(calls).toEqual(['daily', 'cbt', 'premium']);
  });

  it('레이아웃: premiumDue=false면 프리미엄 건너뜀, null이면 시도', async () => {
    const u = uid();
    await ensureDailyGrants(u, 1, { kind: 'due', due: async () => false });
    expect(calls).toEqual(['daily', 'cbt']);
    calls.length = 0;
    await ensureDailyGrants(u, 1, { kind: 'due', due: async () => null });
    // 일일 보급은 같은 날 같은 인스턴스에서 이미 마크됨 → 프리미엄만
    expect(calls).toEqual(['premium']);
  });

  it('레이아웃 밖(daily-mark): 같은 날 두 번째부터는 아무것도 하지 않는다', async () => {
    const u = uid();
    await ensureDailyGrants(u, 2, { kind: 'daily-mark' });
    expect(calls).toEqual(['daily', 'cbt', 'premium']);
    calls.length = 0;
    await ensureDailyGrants(u, 2, { kind: 'daily-mark' });
    expect(calls).toEqual([]);
  });
});
