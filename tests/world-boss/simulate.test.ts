import { describe, expect, it } from 'vitest';

import { CONQUEST_DMG_MAX, CONQUEST_DMG_MIN, WORLD_BOSS_STAGE_BASE_HP, WORLD_BOSS_TRAIT } from '@/lib/game/guild/balance';
import { WORLD_BOSS_LOCAL, simulateWorldBoss, type WorldBossUnit } from '@/lib/game/world-boss/simulate';

const unit = (i: number, cp: number): WorldBossUnit => ({ userId: `u${i}`, nickname: `n${i}`, items: [{ slot: 'weapon', code: `w${i}`, cp, av: false }], hasAvatar: false, guildId: null, guildName: null });
const cpOf = (u: WorldBossUnit) => u.items.reduce((a, x) => a + x.cp, 0);
const phases = (codes: { weapon?: string[]; armor?: string[]; accessory?: string[] }, n = 7) =>
  Array.from({ length: n }, () => ({ weapon: codes.weapon ?? [], armor: codes.armor ?? [], accessory: codes.accessory ?? [] }));

describe('월드보스 시뮬 — 라운드제·보스 한 방(순수)', () => {
  it('같은 입력·시드면 같은 결과(결정론)', () => {
    const us = [unit(1, 1000), unit(2, 2000), unit(3, 3000)];
    const a = simulateWorldBoss(us, 'worldboss:1');
    const b = simulateWorldBoss(us, 'worldboss:1');
    expect(a).toEqual(b);
    expect(simulateWorldBoss(us, 'worldboss:2').totalDamage).not.toBe(a.totalDamage);
  });

  it('빈 원정대는 피해 0·라운드 0', () => {
    expect(simulateWorldBoss([], 's')).toEqual({ totalDamage: 0, rounds: 0, members: [], reveals: [], finale: { roster: [], events: [], drops: [], weak: [], rounds: 0, totalDamage: 0 } });
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
        const cp = cpOf(us[a]!);
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

  it('공격마다 보상 하나: drops는 events와 짝, 쓰러짐은 [0,0], 원정대원 합계와 같다', () => {
    const us = Array.from({ length: 10 }, (_, i) => unit(i, 5_000 * (i + 1)));
    const r = simulateWorldBoss(us, 'worldboss:drops');
    const drops = r.finale.drops!;
    expect(drops).toHaveLength(r.finale.events.length);
    const sum = new Map<number, { d: number; b: number }>();
    r.finale.events.forEach(([a], k) => {
      const [d, b] = drops[k]!;
      if (a < 0) return expect([d, b]).toEqual([0, 0]);
      expect(d > 0 && b > 0).toBe(false);
      const s = sum.get(a) ?? { d: 0, b: 0 };
      sum.set(a, { d: s.d + d, b: s.b + b });
    });
    r.members.forEach((m, i) => expect({ d: m.diamond, b: m.boxes }).toEqual(sum.get(i) ?? { d: 0, b: 0 }));
    // 보상 난수는 전투와 따로 — 같은 시드면 전투 기록이 그대로.
    expect(simulateWorldBoss(us, 'worldboss:drops').finale.events).toEqual(r.finale.events);
  });

  it('아바타 +50%·약점 +100%는 더하고, 약점 장비로 갈아입은 부위도 커스텀 아바타면 아바타 보너스를 유지한다', () => {
    const base: WorldBossUnit = { userId: 'a', nickname: 'a', items: [{ slot: 'weapon', code: 'w', cp: 1000, av: false }], hasAvatar: false, guildId: null, guildName: null };
    const ratio = (u: WorldBossUnit, weak = phases({})) => simulateWorldBoss([u], 'x', { startDamage: 0, weak }).totalDamage / simulateWorldBoss([base], 'x').totalDamage;
    expect(ratio({ ...base, items: [{ ...base.items[0]!, av: true }], hasAvatar: true })).toBeCloseTo(1.5, 2);
    expect(ratio(base, phases({ weapon: ['w'] }))).toBeCloseTo(2, 2); // 기본 아바타 + 약점
    expect(ratio({ ...base, hasAvatar: true }, phases({ weapon: ['w'] }))).toBeCloseTo(2.5, 2); // 아바타 장비는 아니지만 약점이라 유지
    expect(ratio({ ...base, items: [{ ...base.items[0]!, av: true }], hasAvatar: true }, phases({ weapon: ['w'] }))).toBeCloseTo(2.5, 2);
  });

  it('장착 장비가 없으면 피해 0이지만 공격 보상은 뽑고, 난수 흐름은 같다', () => {
    const naked: WorldBossUnit = { userId: 'z', nickname: 'z', items: [], hasAvatar: false, guildId: null, guildName: null };
    const r = simulateWorldBoss([naked, unit(1, 1000)], 'naked');
    expect(r.members[0]!.damage).toBe(0);
    expect(r.members[0]!.attacks).toBeGreaterThan(0);
    const r2 = simulateWorldBoss([unit(0, 5), unit(1, 1000)], 'naked');
    expect(r2.finale.events.map((e) => [e[0], e[1]])).toEqual(r.finale.events.map((e) => [e[0], e[1]]));
  });

  it('페이즈는 공격 순간의 단계로 정한다 — 출발 전 누적 피해가 5단계를 넘었으면 2페이즈 약점이 적용된다', () => {
    const u = unit(1, 1000);
    const weak = Array.from({ length: 7 }, (_, i) => ({ weapon: i === 1 ? ['w1'] : [], armor: [], accessory: [] }));
    const fresh = simulateWorldBoss([u], 'ph', { startDamage: 0, weak });
    let five = 0;
    for (let k = 1; k <= 5; k++) five += Math.round(WORLD_BOSS_STAGE_BASE_HP * 1.1 ** (k - 1));
    const later = simulateWorldBoss([u], 'ph', { startDamage: five + 1, weak });
    expect(fresh.finale.weak).toEqual([0, 0]);
    expect(later.finale.weak![0]).toBe(1);
    expect(later.totalDamage).toBeGreaterThan(fresh.totalDamage * 1.9);
    expect(later.reveals).toEqual([{ phase: 1, slot: 'weapon', code: 'w1', unit: 0 }]);
  });

  it('처음 맞힌 약점만 공개 목록에 한 번 담기고, 부위 비트가 기록된다', () => {
    const a: WorldBossUnit = { userId: 'a', nickname: 'a', items: [{ slot: 'weapon', code: 'W', cp: 10, av: false }, { slot: 'armor', code: 'A', cp: 10, av: false }], hasAvatar: false, guildId: null, guildName: null };
    const b: WorldBossUnit = { ...a, userId: 'b', nickname: 'b' };
    const r = simulateWorldBoss([a, b], 'rv', { startDamage: 0, weak: phases({ weapon: ['W'], armor: ['A'] }) });
    expect(r.reveals.map((x) => [x.code, x.unit])).toEqual([['W', 0], ['A', 0]]);
    r.finale.events.forEach(([att], k) => expect(r.finale.weak![k]).toBe(att >= 0 ? 3 : 0));
    expect(r.members[0]!.weakHits).toBe(2 * r.members[0]!.attacks);
  });

  it('약점 2개 이상 맞힌 공격은 꽝이 줄어든다(행운)', () => {
    const two: WorldBossUnit = { userId: 't', nickname: 't', items: [{ slot: 'weapon', code: 'W', cp: 10, av: false }, { slot: 'armor', code: 'A', cp: 10, av: false }], hasAvatar: false, guildId: null, guildName: null };
    let missLucky = 0, missPlain = 0, n = 0;
    for (let s = 0; s < 400; s++) {
      const team = Array.from({ length: 10 }, (_, i) => ({ ...two, userId: `t${i}` }));
      const lucky = simulateWorldBoss(team, `lk${s}`, { startDamage: 0, weak: phases({ weapon: ['W'], armor: ['A'] }) });
      const plain = simulateWorldBoss(team, `lk${s}`, { startDamage: 0, weak: phases({ weapon: ['W'] }) });
      lucky.finale.events.forEach(([a], k) => { if (a < 0) return; n++; if (lucky.finale.drops![k]![0] + lucky.finale.drops![k]![1] === 0) missLucky++; });
      plain.finale.events.forEach(([a], k) => { if (a < 0) return; if (plain.finale.drops![k]![0] + plain.finale.drops![k]![1] === 0) missPlain++; });
    }
    expect(missLucky / n).toBeGreaterThan(0.32);
    expect(missLucky / n).toBeLessThan(0.38);
    expect(missPlain / n).toBeGreaterThan(0.47);
    expect(missPlain / n).toBeLessThan(0.53);
  });

  it('특성: 구성 배율은 전원 피해에, 떠도는 바람은 무소속에게만, 치명 약점은 약점 보너스 3배, 황금 깃털은 꽝이 준다', () => {
    const us = [
      { ...unit(1, 100_000), guildId: 'a', guildName: 'A' },
      { ...unit(2, 100_000), guildId: 'b', guildName: 'B' },
      { ...unit(3, 100_000), guildId: 'c', guildName: 'C' },
      { ...unit(4, 100_000), guildId: null, guildName: null },
    ];
    const base = simulateWorldBoss(us, 'worldboss:t');
    const ally = simulateWorldBoss(us, 'worldboss:t', { startDamage: 0, weak: [], traits: ['alliance'] });
    // 같은 시드라 난수가 같고, 피해만 ×1.5(반올림 오차 안)
    expect(ally.rounds).toBe(base.rounds);
    expect(ally.totalDamage / base.totalDamage).toBeCloseTo(WORLD_BOSS_TRAIT.alliance3, 2);
    const wind = simulateWorldBoss(us, 'worldboss:t', { startDamage: 0, weak: [], traits: ['wanderer'] });
    wind.members.forEach((m, i) => {
      const ratio = m.damage / base.members[i]!.damage;
      expect(ratio).toBeCloseTo(us[i]!.guildId ? 1 : WORLD_BOSS_TRAIT.wandererMult, 2);
    });
    // 치명 약점 — 약점 장비(w1)만 3배
    const weak = phases({ weapon: ['w1'] });
    const normal = simulateWorldBoss(us, 'worldboss:t', { startDamage: 0, weak });
    const fatal = simulateWorldBoss(us, 'worldboss:t', { startDamage: 0, weak, traits: ['fatal_weak'] });
    expect(fatal.members[0]!.damage / normal.members[0]!.damage).toBeCloseTo((1 + WORLD_BOSS_TRAIT.fatalWeakBonus) / 2, 2);
    expect(fatal.members[1]!.damage).toBe(normal.members[1]!.damage);
    // 황금 깃털 — 많은 원정대로 꽝 비율 ≈ 40%
    let miss = 0, n = 0;
    for (let s = 0; s < 150; s++) {
      const r = simulateWorldBoss(Array.from({ length: 10 }, (_, i) => unit(i, 10_000)), `worldboss:g${s}`, { startDamage: 0, weak: [], traits: ['golden_feather'] });
      r.finale.events.forEach(([a], k) => { if (a < 0) return; n++; if (r.finale.drops![k]![0] + r.finale.drops![k]![1] === 0) miss++; });
    }
    expect(miss / n).toBeGreaterThan(0.37);
    expect(miss / n).toBeLessThan(0.43);
  });
});

