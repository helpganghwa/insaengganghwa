import { describe, expect, it } from 'vitest';

import { CONQUEST_DMG_MAX, CONQUEST_DMG_MIN } from '@/lib/game/guild/balance';
import { WORLD_BOSS_LOCAL, simulateWorldBoss, type WorldBossUnit } from '@/lib/game/world-boss/simulate';

const unit = (i: number, cp: number): WorldBossUnit => ({ userId: `u${i}`, nickname: `n${i}`, cp, guildId: null, guildName: null });

describe('월드보스 시뮬 — 라운드제·보스 한 방(순수)', () => {
  it('같은 입력·시드면 같은 결과(결정론)', () => {
    const us = [unit(1, 1000), unit(2, 2000), unit(3, 3000)];
    const a = simulateWorldBoss(us, 'worldboss:1');
    const b = simulateWorldBoss(us, 'worldboss:1');
    expect(a).toEqual(b);
    expect(simulateWorldBoss(us, 'worldboss:2').totalDamage).not.toBe(a.totalDamage);
  });

  it('빈 원정대는 피해 0·라운드 0', () => {
    expect(simulateWorldBoss([], 's')).toEqual({ totalDamage: 0, rounds: 0, members: [], finale: { roster: [], events: [], rounds: 0, totalDamage: 0 } });
  });

  it('라운드마다 생존자 전원이 한 번씩 공격하고 보스가 한 명을 쓰러뜨린다 → 라운드 수 = 인원, 공격 횟수 합 = n(n+1)/2', () => {
    for (const n of [1, 3, 5, 10]) {
      const us = Array.from({ length: n }, (_, i) => unit(i, 10_000 * (i + 1)));
      const r = simulateWorldBoss(us, `seed-${n}`);
      expect(r.rounds).toBe(n);
      expect(r.members.reduce((a, m) => a + m.attacks, 0)).toBe((n * (n + 1)) / 2);
      // 1인 평균 공격 = (n+1)/2
      expect(r.members.reduce((a, m) => a + m.attacks, 0) / n).toBe((n + 1) / 2);
      // 모두 쓰러진다(처치·생존 없음) — 쓰러진 라운드는 1..n이 한 번씩.
      expect([...r.members.map((m) => m.fellRound)].sort((a, b) => a! - b!)).toEqual(Array.from({ length: n }, (_, i) => i + 1));
      // k라운드에 쓰러진 사람의 공격 횟수 = k.
      for (const m of r.members) expect(m.attacks).toBe(m.fellRound);
    }
  });

  it('피해는 전투력 × [0.5, 1.2] 안이고 합계·기록이 맞는다', () => {
    const us = [unit(1, 1_000_000), unit(2, 50_000), unit(3, 777)];
    const r = simulateWorldBoss(us, 'range');
    let running = 0;
    for (const [a, t, dmg, aux] of r.finale.events) {
      if (t === WORLD_BOSS_LOCAL) {
        const cp = us[a]!.cp;
        expect(dmg).toBeGreaterThanOrEqual(Math.max(1, Math.floor(cp * CONQUEST_DMG_MIN)));
        expect(dmg).toBeLessThanOrEqual(Math.ceil(cp * CONQUEST_DMG_MAX));
        running += dmg;
        expect(aux).toBe(running);
      } else {
        expect(a).toBe(WORLD_BOSS_LOCAL);
        expect(dmg).toBe(0);
        expect(r.members[t]!.fellRound).toBe(aux);
      }
    }
    expect(r.totalDamage).toBe(running);
    expect(r.members.reduce((a, m) => a + m.damage, 0)).toBe(running);
    expect(r.finale.roster.map((x) => x.userId)).toEqual(['u1', 'u2', 'u3']);
  });

  it('약한 사람이 자리를 채우면 모두의 공격 횟수가 늘어 강자의 피해가 커진다', () => {
    const strong = unit(0, 10_000_000);
    const solo = simulateWorldBoss([strong], 'fill');
    const filled = simulateWorldBoss([strong, ...Array.from({ length: 9 }, (_, i) => unit(i + 1, 10))], 'fill');
    expect(solo.members[0]!.attacks).toBe(1);
    expect(filled.members[0]!.attacks).toBeGreaterThanOrEqual(1);
    // 10명이면 강자의 기대 공격 횟수 5.5회 — 시드별 편차가 있어 여러 시드의 평균으로 확인.
    let sum = 0;
    const N = 200;
    for (let s = 0; s < N; s++) sum += simulateWorldBoss([strong, ...Array.from({ length: 9 }, (_, i) => unit(i + 1, 10))], `avg-${s}`).members[0]!.attacks;
    expect(sum / N).toBeGreaterThan(4.5);
    expect(sum / N).toBeLessThan(6.5);
  });
});
