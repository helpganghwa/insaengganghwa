import { describe, expect, it } from 'vitest';

import { MELEE_REPLAY_ROUNDS } from '@/lib/game/balance';
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

  it('소규모(라운드 ≤ REPLAY) — 전체 리플레이: 로스터=전원, 이벤트 인덱스/값 유효', () => {
    const ps = roster(60, (i) => 1000 + i * 100); // rounds ≈ 120 ≤ 1000 → 전체
    const { finale, championUserId } = simulateMelee(ps, 'small');
    expect(finale.events.length).toBeLessThanOrEqual(MELEE_REPLAY_ROUNDS);
    expect(finale.roster).toHaveLength(60); // 전체 노출 시 전원 등장
    // 챔피언 = 로스터 rank 1
    const champ = finale.roster.find((r) => r.rank === 1);
    expect(champ?.userId).toBe(championUserId);
    for (const [a, t, d, h] of finale.events) {
      expect(a).toBeGreaterThanOrEqual(0);
      expect(a).toBeLessThan(finale.roster.length);
      expect(t).toBeLessThan(finale.roster.length);
      expect(a).not.toBe(t);
      expect(d).toBeGreaterThanOrEqual(1);
      expect(typeof h).toBe('number'); // 타겟 잔여HP(≤0=탈락)
    }
    // 마지막 이벤트는 챔피언 결정타 → 타겟 잔여HP ≤ 0
    expect(finale.events.at(-1)![3]).toBeLessThanOrEqual(0);
  });

  it('대규모(라운드 > REPLAY) — 마지막 REPLAY 라운드만, 챔피언 포함', () => {
    const ps = roster(2000, (i) => 1000 + i * 10); // rounds ≈ 4000 > 1000
    const { finale, championUserId } = simulateMelee(ps, 'big');
    expect(finale.events).toHaveLength(MELEE_REPLAY_ROUNDS);
    expect(finale.roster.length).toBeLessThan(2000); // 일부만 등장
    expect(finale.roster.some((r) => r.userId === championUserId && r.rank === 1)).toBe(true);
    for (const [a, t] of finale.events) {
      expect(a).toBeLessThan(finale.roster.length);
      expect(t).toBeLessThan(finale.roster.length);
    }
  });

  it('소규모 N(=1, 2)', () => {
    const one = simulateMelee(roster(1, () => 5000), 's');
    expect(one.championUserId).toBe('u0');
    expect(one.ranks).toEqual([
      { userId: 'u0', finalRank: 1, killerUserId: null, events: [], attackCount: 0, defenseCount: 0 },
    ]);

    const two = simulateMelee(roster(2, (i) => 1000 * (i + 1)), 's');
    expect(two.ranks.map((r) => r.finalRank).sort()).toEqual([1, 2]);
  });

  it('내 전투 미니로그 — 첫 탈락 포함 전원이 본인 이벤트 보유', () => {
    const ps = roster(40, (i) => 1000 + i * 200);
    const { ranks } = simulateMelee(ps, 'mine');
    for (const r of ranks) {
      expect(r.events.length).toBeGreaterThanOrEqual(1); // 죽음(피격) 또는 우승(공격) 최소 1
    }
    const last = ranks.find((r) => r.finalRank === 40)!; // 첫 탈락(꼴등)
    expect(last.events.length).toBeGreaterThanOrEqual(1);
    const [role, opp, dmg, hp] = last.events.at(-1)!; // 마지막 = 본인 사망
    expect(role).toBe(1); // 피격(내가 맞음)
    expect(typeof opp).toBe('string');
    expect(dmg).toBeGreaterThanOrEqual(1);
    expect(hp).toBeLessThanOrEqual(0); // 사망
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
