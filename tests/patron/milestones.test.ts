import { describe, expect, it } from 'vitest';

import {
  PATRON_MILESTONES,
  formatKrwMan,
  nextMilestone,
  patronMailBody,
  patronMailTitle,
  reachedMilestones,
  splitBoxesEven,
} from '@/lib/game/patron/milestones';

describe('후원 구간 보상 정의(2026-08-26 확정)', () => {
  it('40구간 · 오름차순 · 1,000만 완주 시 💎200,000 + 📦6,000', () => {
    expect(PATRON_MILESTONES).toHaveLength(40);
    for (let i = 1; i < PATRON_MILESTONES.length; i++) {
      expect(PATRON_MILESTONES[i]!.krw).toBeGreaterThan(PATRON_MILESTONES[i - 1]!.krw);
    }
    const total = PATRON_MILESTONES.reduce((a, m) => ({ d: a.d + m.diamond, b: a.b + m.boxes }), { d: 0, b: 0 });
    expect(total).toEqual({ d: 200_000, b: 6_000 });
    for (const m of PATRON_MILESTONES) expect(m.boxes % 3).toBe(0);
  });

  it('구간 폭·정액 규칙 — A 5만/1,000·30, B 10만/2,000·60, C 50만/10,000·300, D 600만 20,000·600 후 50만/10,000·300', () => {
    const at = (krw: number) => PATRON_MILESTONES.find((m) => m.krw === krw)!;
    expect(at(50_000)).toMatchObject({ diamond: 1_000, boxes: 30 });
    expect(at(500_000)).toMatchObject({ diamond: 1_000, boxes: 30 });
    expect(at(600_000)).toMatchObject({ diamond: 2_000, boxes: 60 });
    expect(at(2_000_000)).toMatchObject({ diamond: 2_000, boxes: 60 });
    expect(at(2_500_000)).toMatchObject({ diamond: 10_000, boxes: 300 });
    expect(at(5_000_000)).toMatchObject({ diamond: 10_000, boxes: 300 });
    expect(at(6_000_000)).toMatchObject({ diamond: 20_000, boxes: 600 });
    // 2026-09-04: 650만부터 50만 단위(폭 대비 정액 동일 → 환급률 불변)
    expect(at(6_500_000)).toMatchObject({ diamond: 10_000, boxes: 300 });
    expect(at(7_000_000)).toMatchObject({ diamond: 10_000, boxes: 300 });
    expect(at(10_000_000)).toMatchObject({ diamond: 10_000, boxes: 300 });
    // 누적 환급률 ≈ 8.5% (₩4.25/💎) — 구간 끝마다 동일
    const cum = (krw: number) => reachedMilestones(krw).reduce((a, m) => a + m.diamond, 0) * 4.25 / krw;
    expect(cum(500_000)).toBeCloseTo(0.085, 3);
    expect(cum(2_000_000)).toBeCloseTo(0.085, 3);
    expect(cum(10_000_000)).toBeCloseTo(0.085, 3);
  });

  it('칭호 구간은 보너스 구간 위에 정확히 겹친다(5·20·50·200·500·1,000만)', () => {
    const titled = PATRON_MILESTONES.filter((m) => m.titleCode).map((m) => [m.krw, m.titleCode]);
    expect(titled).toEqual([
      [50_000, 'pay_5'],
      [200_000, 'pay_20'],
      [500_000, 'pay_50'],
      [2_000_000, 'pay_200'],
      [5_000_000, 'pay_500'],
      [10_000_000, 'pay_1000'],
    ]);
  });

  it('도달 구간 — 현재 1위 결제자(₩3,655,600)는 28구간 · 💎70,000 · 📦2,100', () => {
    const r = reachedMilestones(3_655_600);
    expect(r).toHaveLength(28);
    expect(r.reduce((a, m) => a + m.diamond, 0)).toBe(70_000);
    expect(r.reduce((a, m) => a + m.boxes, 0)).toBe(2_100);
    expect(nextMilestone(3_655_600)?.krw).toBe(4_000_000);
    expect(reachedMilestones(49_999)).toHaveLength(0);
    expect(nextMilestone(10_000_000)).toBeNull();
  });

  it('우편 문안 — 제목에 누적액(+칭호), 본문은 공통 2문장(+칭호 문단), 💎📦 외 이모지 없음', () => {
    const plain = PATRON_MILESTONES.find((m) => m.krw === 100_000)!;
    expect(patronMailTitle(plain)).toBe('후원 감사 보급 — 누적 10만');
    expect(patronMailBody(plain)).toBe('대장간을 지켜주시는 마음에 감사드립니다. 후원 감사 보급을 전합니다.');
    const titled = PATRON_MILESTONES.find((m) => m.krw === 500_000)!;
    expect(patronMailTitle(titled)).toBe('후원 감사 보급 — 누적 50만 · 왕실 후원자');
    expect(patronMailBody(titled)).toContain('왕실 후원자 칭호를 전합니다.');
    expect(formatKrwMan(10_000_000)).toBe('1,000만');
    for (const m of PATRON_MILESTONES) {
      const text = patronMailTitle(m) + patronMailBody(m);
      expect(/\p{Extended_Pictographic}/u.test(text)).toBe(false);
    }
  });

  it('상자 슬롯 균등 분배', () => {
    expect(splitBoxesEven(30)).toEqual({ weapon: 10, armor: 10, accessory: 10 });
    expect(splitBoxesEven(600)).toEqual({ weapon: 200, armor: 200, accessory: 200 });
    expect(splitBoxesEven(7)).toEqual({ weapon: 3, armor: 2, accessory: 2 });
  });
});
