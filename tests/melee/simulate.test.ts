import { describe, expect, it } from 'vitest';

import { MELEE_FINALE_SIZE } from '@/lib/game/balance';
import { simulateMelee, type MeleeParticipantInput } from '@/lib/game/melee/simulate';

function roster(n: number, cpFn: (i: number) => number): MeleeParticipantInput[] {
  return Array.from({ length: n }, (_, i) => ({
    userId: `u${i}`,
    nickname: `유저${i}`,
    cp: cpFn(i),
  }));
}

describe('simulateMelee', () => {
  it('결정론 — 동일 입력·시드는 동일 결과', () => {
    const ps = roster(40, (i) => 1000 + i * 200);
    const a = simulateMelee(ps, '2026-06-02');
    const b = simulateMelee(ps, '2026-06-02');
    expect(b).toEqual(a);
  });

  it('시드가 다르면 보통 결과가 다름', () => {
    const ps = roster(40, (i) => 1000 + i * 200);
    const a = simulateMelee(ps, 'seed-A');
    const b = simulateMelee(ps, 'seed-B');
    expect(b.championUserId === a.championUserId && JSON.stringify(b.ranks) === JSON.stringify(a.ranks)).toBe(false);
  });

  it('등수는 1..N 순열, 챔피언 1명(rank1·killer null), 나머지는 killer 존재', () => {
    const ps = roster(50, (i) => 800 + i * 300);
    const { ranks, championUserId } = simulateMelee(ps, 'perm');
    const sorted = ranks.map((r) => r.finalRank).sort((x, y) => x - y);
    expect(sorted).toEqual(Array.from({ length: 50 }, (_, i) => i + 1));

    const champions = ranks.filter((r) => r.finalRank === 1);
    expect(champions).toHaveLength(1);
    expect(champions[0]!.userId).toBe(championUserId);
    expect(champions[0]!.killerUserId).toBeNull();

    for (const r of ranks) {
      if (r.finalRank === 1) continue;
      expect(r.killerUserId).not.toBeNull();
      expect(r.killerUserId).not.toBe(r.userId); // 자기 자신이 죽일 수 없음
    }
  });

  it('finale 로스터 = min(N, FINALE_SIZE)등, 이벤트는 로스터 내 유저만, 챔피언 포함', () => {
    const n = MELEE_FINALE_SIZE + 80;
    const ps = roster(n, (i) => 1000 + i * 50);
    const { finale, championUserId } = simulateMelee(ps, 'finale');
    expect(finale.roster).toHaveLength(MELEE_FINALE_SIZE);
    const ids = new Set(finale.roster.map((r) => r.userId));
    expect(ids.has(championUserId)).toBe(true);
    for (const e of finale.events) {
      expect(ids.has(e.a)).toBe(true);
      expect(ids.has(e.t)).toBe(true);
      expect(e.d).toBeGreaterThanOrEqual(1);
    }
  });

  it('소규모 N(=1, 2)', () => {
    const one = simulateMelee(roster(1, () => 5000), 's');
    expect(one.championUserId).toBe('u0');
    expect(one.ranks).toEqual([{ userId: 'u0', finalRank: 1, killerUserId: null }]);

    const two = simulateMelee(roster(2, (i) => 1000 * (i + 1)), 's');
    expect(two.ranks.map((r) => r.finalRank).sort()).toEqual([1, 2]);
  });

  it('전투력이 높을수록 평균 등수가 좋다(여러 시드 통계)', () => {
    const N = 50;
    const ps = roster(N, (i) => 1000 + i * 400); // u0 최저 ~ u49 최고
    const SEEDS = 400;
    let topRankSum = 0; // 최고 전투력(u49)
    let botRankSum = 0; // 최저 전투력(u0)
    for (let s = 0; s < SEEDS; s++) {
      const { ranks } = simulateMelee(ps, `stat-${s}`);
      const byId = new Map(ranks.map((r) => [r.userId, r.finalRank]));
      topRankSum += byId.get('u49')!;
      botRankSum += byId.get('u0')!;
    }
    const topAvg = topRankSum / SEEDS;
    const botAvg = botRankSum / SEEDS;
    // 등수는 작을수록 좋음 → 최고 전투력 평균등수가 최저보다 분명히 작아야.
    expect(topAvg).toBeLessThan(botAvg);
    expect(topAvg).toBeLessThan(N / 2); // 상위권
    expect(botAvg).toBeGreaterThan(N / 2); // 하위권
  });
});
