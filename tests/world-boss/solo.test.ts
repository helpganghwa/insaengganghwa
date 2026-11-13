import { describe, expect, it } from 'vitest';

import { rollSoloRun, soloPhaseFor, soloPhaseHp, soloRankReward, soloRunScore, soloShareOf, soloSharePct, soloShareReward } from '@/lib/game/world-boss/solo';

function seeded(seed: number) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}

describe('개인 월드보스 규칙', () => {
  it('10타, 빗나감은 0·치명 없음, 묶인 부위가 0이면 효과 없음', () => {
    const r = seeded(7);
    for (let n = 0; n < 200; n++) {
      const hits = rollSoloRun({ weapon: 1000, armor: 0, accessory: 500 }, r);
      expect(hits).toHaveLength(10);
      for (const h of hits) {
        expect(h.p).not.toBe('armor');
        if (h.p === 'dodge') expect(h).toEqual({ p: 'dodge', d: 0, c: false });
        if (h.p === 'weapon') expect(h.d).toBeLessThanOrEqual(Math.round(500 * 1.2 * 1.5));
        expect(h.d).toBeLessThanOrEqual(Math.round(1500 * 2 * 1.2 * 1.5));
      }
    }
  });

  it('패턴 확률이 확정표에 가깝다', () => {
    const r = seeded(11);
    const n: Record<string, number> = {};
    const N = 20000;
    for (let i = 0; i < N; i++) for (const h of rollSoloRun({ weapon: 1, armor: 1, accessory: 1 }, r)) n[h.p] = (n[h.p] ?? 0) + 1;
    const f = (k: string) => (n[k] ?? 0) / (N * 10);
    expect(f('none')).toBeCloseTo(0.3, 1);
    expect(f('crouch')).toBeCloseTo(0.15, 1);
    expect(f('dodge')).toBeCloseTo(0.05, 1);
    expect(f('expose')).toBeCloseTo(0.05, 1);
  });

  it('점수 = 10타 합', () => {
    expect(soloRunScore([{ p: 'none', d: 3, c: false }, { p: 'dodge', d: 0, c: false }, { p: 'expose', d: 7, c: true }])).toBe(10);
  });

  it('페이즈: 1,000만 × 1.1^(n-1) 누적', () => {
    expect(soloPhaseHp(1)).toBe(10_000_000);
    expect(soloPhaseHp(2)).toBe(11_000_000);
    expect(soloPhaseFor(0)).toEqual({ stage: 0, into: 0, need: 10_000_000 });
    expect(soloPhaseFor(10_000_000).stage).toBe(1);
    expect(soloPhaseFor(21_000_000 - 1).stage).toBe(1);
    expect(soloPhaseFor(21_000_000).stage).toBe(2);
  });

  it('참가·기여도 보상 + 페이즈 보너스(상자 3의 배수), 순위 보상', () => {
    expect(soloShareReward(0, 0)).toEqual({ diamond: 30, boxes: 6 });
    expect(soloShareReward(0.1, 0)).toEqual({ diamond: 1530, boxes: 207 });
    expect(soloShareReward(0.01, 25)).toEqual({ diamond: Math.round(180 * 1.5), boxes: Math.round((26 * 1.5) / 3) * 3 }); // +50%
    expect(soloShareReward(1, 100).diamond).toBe(Math.round(15_030 * 1.6)); // 상한 +60%
    for (let st = 0; st < 40; st++) for (const sh of [0, 0.0003, 0.004, 0.02, 0.07, 0.15, 0.33, 1]) expect(soloShareReward(sh, st).boxes % 3).toBe(0);
    expect(soloShareOf(5, 0)).toBe(0);
    expect(soloShareOf(25, 100)).toBe(0.25);
    expect(soloSharePct(0.0005)).toBe('0.1% 미만');
    expect(soloSharePct(0.123)).toBe('12.3%');
    expect(soloRankReward(1)).toEqual({ diamond: 2000, boxes: 90 });
    expect(soloRankReward(7)).toEqual({ diamond: 500, boxes: 24 });
    expect(soloRankReward(30)).toEqual({ diamond: 150, boxes: 9 });
    expect(soloRankReward(31)).toEqual({ diamond: 0, boxes: 0 });
  });
});
