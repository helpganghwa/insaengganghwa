import { describe, expect, it } from 'vitest';

import { CONQUEST_REPLAY_ROUNDS } from '@/lib/game/guild/balance';
import { simulateConquest, type ConquestUnit } from '@/lib/game/guild/conquest/simulate';

/** g길드별 size명 유닛 — guildId='g{idx}', effCp는 기본+오프셋. */
function teams(spec: Array<{ size: number; cp: number }>): ConquestUnit[] {
  const units: ConquestUnit[] = [];
  spec.forEach((t, gi) => {
    for (let i = 0; i < t.size; i++) {
      units.push({
        userId: `g${gi}u${i}`,
        nickname: `길드${gi}-${i}`,
        guildId: `g${gi}`,
        guildName: `길드${gi}`,
        effCp: t.cp + i * 50,
      });
    }
  });
  return units;
}

describe('simulateConquest', () => {
  it('결정론 — 동일 입력·시드는 동일 결과', () => {
    const u = teams([{ size: 8, cp: 1000 }, { size: 8, cp: 1200 }, { size: 6, cp: 900 }]);
    const a = simulateConquest(u, '2026-06-09:41');
    const b = simulateConquest(u, '2026-06-09:41');
    expect(b).toEqual(a);
  });

  it('시드가 다르면 보통 결과가 다름', () => {
    const u = teams([{ size: 10, cp: 1000 }, { size: 10, cp: 1000 }]);
    const a = simulateConquest(u, 'seed-A');
    const b = simulateConquest(u, 'seed-B');
    expect(JSON.stringify(a.ranks) === JSON.stringify(b.ranks)).toBe(false);
  });

  it('한 길드만 생존 — 승자 길드 유닛만 생존, 패배 길드는 전멸', () => {
    const u = teams([{ size: 6, cp: 1100 }, { size: 6, cp: 1000 }, { size: 5, cp: 1300 }]);
    const { winnerGuildId, ranks } = simulateConquest(u, 'one-survives');
    expect(winnerGuildId).not.toBeNull();
    const byUser = new Map(u.map((x) => [x.userId, x]));
    // 생존자는 모두 승자 길드(단, 승자 길드원도 도중 탈락 가능 → 탈락=비승자 단정 불가).
    for (const r of ranks) {
      if (r.survived) expect(byUser.get(r.userId)!.guildId).toBe(winnerGuildId);
    }
    // 생존 길드는 정확히 1개(패배 길드는 전원 탈락).
    const survivingGuilds = new Set(ranks.filter((r) => r.survived).map((r) => byUser.get(r.userId)!.guildId));
    expect(survivingGuilds.size).toBe(1);
    expect([...survivingGuilds][0]).toBe(winnerGuildId);
  });

  it('같은 길드원 비공격 — killer는 항상 다른 길드', () => {
    const u = teams([{ size: 7, cp: 1000 }, { size: 7, cp: 1050 }, { size: 7, cp: 980 }]);
    const { ranks } = simulateConquest(u, 'no-friendly-fire');
    const guildOf = new Map(u.map((x) => [x.userId, x.guildId]));
    for (const r of ranks) {
      if (r.killerUserId == null) continue;
      expect(guildOf.get(r.killerUserId)).not.toBe(guildOf.get(r.userId));
    }
  });

  it('등수는 1..N 순열', () => {
    const u = teams([{ size: 9, cp: 800 }, { size: 8, cp: 1200 }]);
    const { ranks } = simulateConquest(u, 'perm');
    const sorted = ranks.map((r) => r.finalRank).sort((x, y) => x - y);
    expect(sorted).toEqual(Array.from({ length: u.length }, (_, i) => i + 1));
  });

  it('무혈 — 한 길드만 참가하면 전투 없이 즉시 승(라운드 0·전원 생존)', () => {
    const u = teams([{ size: 5, cp: 1000 }]);
    const { winnerGuildId, totalRounds, ranks } = simulateConquest(u, 'walkover');
    expect(winnerGuildId).toBe('g0');
    expect(totalRounds).toBe(0);
    expect(ranks.every((r) => r.survived)).toBe(true);
    // 생존자 등수는 잔여HP순 1..s 순열.
    expect(ranks.map((r) => r.finalRank).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5]);
  });

  it('참가 0 — 전투 없음(winner null)', () => {
    const { winnerGuildId, ranks, totalRounds } = simulateConquest([], 'empty');
    expect(winnerGuildId).toBeNull();
    expect(ranks).toHaveLength(0);
    expect(totalRounds).toBe(0);
  });

  it('1v1 다수 길드 — 리플레이 이벤트 인덱스/HP 유효', () => {
    const u = teams([{ size: 12, cp: 1000 }, { size: 12, cp: 1000 }]);
    const { finale } = simulateConquest(u, 'replay');
    expect(finale.events.length).toBeLessThanOrEqual(CONQUEST_REPLAY_ROUNDS);
    for (const [a, t, dmg, hpAfter] of finale.events) {
      expect(a).toBeGreaterThanOrEqual(0);
      expect(a).toBeLessThan(finale.roster.length);
      expect(t).toBeGreaterThanOrEqual(0);
      expect(t).toBeLessThan(finale.roster.length);
      expect(dmg).toBeGreaterThanOrEqual(1);
      // 공격자·타겟은 다른 길드.
      expect(finale.roster[a]!.guildId).not.toBe(finale.roster[t]!.guildId);
      expect(typeof hpAfter).toBe('number');
    }
  });
});
