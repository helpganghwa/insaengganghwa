import { describe, expect, it } from 'vitest';

import { CANDY_ITEM_EXCHANGE, allowedItemCopies, simulateItemCopies } from '@/lib/game/halloween/item-exchange';

/** 할로윈 장비 교환 — 순수 규칙(2026-10-27 확정: 1개 = 사탕 100, 교환 뒤 초월 ≤ 내 최고 초월). */
describe('장비 교환 규칙(순수)', () => {
  it('가격은 상자 1개 교환과 같은 사탕 100', () => {
    expect(CANDY_ITEM_EXCHANGE.candy).toBe(100);
  });

  it('교환 가능 개수: 미보유는 획득 1 + 내 최고 초월까지 채우는 개수(T→T+1 = T+1개)', () => {
    expect(allowedItemCopies(0, null)).toBe(1);
    expect(allowedItemCopies(1, null)).toBe(2);
    expect(allowedItemCopies(3, null)).toBe(1 + 1 + 2 + 3);
    expect(allowedItemCopies(-2, null)).toBe(1);
  });

  it('교환 가능 개수: 보유 중이면 지금 단계·진행도에서 내 최고 초월까지, 이미 도달했으면 0', () => {
    expect(allowedItemCopies(3, { level: 1, progress: 0 })).toBe(2 + 3);
    expect(allowedItemCopies(3, { level: 1, progress: 1 })).toBe(4);
    expect(allowedItemCopies(3, { level: 3, progress: 0 })).toBe(0);
    expect(allowedItemCopies(2, { level: 5, progress: 0 })).toBe(0);
    expect(allowedItemCopies(0, { level: 0, progress: 0 })).toBe(0);
  });

  it('미리보기: 보급 개봉과 같은 선형 규칙으로 획득·진행·자동 초월', () => {
    expect(simulateItemCopies(null, 1)).toEqual({ level: 0, progress: 0, transcended: 0, acquired: true });
    expect(simulateItemCopies(null, 2)).toEqual({ level: 1, progress: 0, transcended: 1, acquired: true });
    expect(simulateItemCopies({ level: 1, progress: 0 }, 2)).toEqual({ level: 2, progress: 0, transcended: 1, acquired: false });
    expect(simulateItemCopies({ level: 1, progress: 1 }, 1)).toEqual({ level: 2, progress: 0, transcended: 1, acquired: false });
    expect(simulateItemCopies({ level: 2, progress: 0 }, 2)).toEqual({ level: 2, progress: 2, transcended: 0, acquired: false });
  });

  it('교환 가능 개수만큼 받으면 정확히 내 최고 초월 단계(진행도 0)에 닿는다', () => {
    for (const maxT of [0, 1, 2, 5, 11]) {
      const s = simulateItemCopies(null, allowedItemCopies(maxT, null));
      expect(s.level).toBe(maxT);
      expect(s.progress).toBe(0);
      const cur = { level: 1, progress: 1 };
      if (maxT > 1) {
        const s2 = simulateItemCopies(cur, allowedItemCopies(maxT, cur));
        expect(s2.level).toBe(maxT);
        expect(s2.progress).toBe(0);
      }
    }
  });
});
