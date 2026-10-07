/**
 * 월드보스 결정론 시뮬 — docs/WORLD-BOSS.md §3. 순수 함수(출발 트랜잭션에서 호출, Vitest 검증).
 *
 * 라운드제: 살아 있는 원정대원이 **모두 한 번씩 먼저** 공격(피해 = 전투력 × U(CONQUEST_DMG_MIN, MAX), 점령전과 같은 식)
 * → 보스가 원정대원 한 명을 무작위로 **한 방에** 쓰러뜨린다(1라운드부터). 역할·버티기·보스 공격력 수치 없음.
 * 모두 쓰러지면 끝. 1인 평균 공격 횟수 = (인원+1)÷2. 보스 체력은 끝이 없어 '처치'는 없다.
 *
 * 기록(finale)은 점령전과 같은 4칸 튜플을 쓴다 — 보스는 로컬 인덱스 -1:
 *  - 공격: [공격자, -1, 피해, 누적 피해]
 *  - 쓰러짐: [-1, 대상, 0, 라운드]
 * 원정대는 최대 10명이라 라운드 ≤ 10, 튜플 ≤ 65개 — 링버퍼가 필요 없다.
 */
import { CONQUEST_DMG_MAX, CONQUEST_DMG_MIN } from '@/lib/game/guild/balance';
import { makeRng } from '@/lib/game/melee/rng';

export const WORLD_BOSS_LOCAL = -1;

export type WorldBossUnit = {
  userId: string;
  nickname: string;
  /** 장비 전투력 스냅샷(출발 시점). */
  cp: number;
  /** 소속 길드(표시용 — 무소속 null). */
  guildId: string | null;
  guildName: string | null;
};

export type WorldBossFinale = {
  /** 등장 원정대원(events의 로컬 인덱스가 가리킴). 순서 = 출발 당시 참가 순. */
  roster: Array<{ userId: string; nickname: string; cp: number; guildId: string | null; guildName: string | null }>;
  /** [공격자, 대상, 피해, 보조값] — 공격은 대상 -1·보조값 = 누적 피해, 쓰러짐은 공격자 -1·보조값 = 라운드. */
  events: Array<[number, number, number, number]>;
  rounds: number;
  totalDamage: number;
};

export type WorldBossMemberResult = { userId: string; attacks: number; damage: number; fellRound: number | null };

export type WorldBossSimResult = {
  totalDamage: number;
  rounds: number;
  members: WorldBossMemberResult[];
  finale: WorldBossFinale;
};

export function simulateWorldBoss(units: readonly WorldBossUnit[], seed: string): WorldBossSimResult {
  const n = units.length;
  const roster = units.map((u) => ({ userId: u.userId, nickname: u.nickname, cp: u.cp, guildId: u.guildId, guildName: u.guildName }));
  if (n === 0) return { totalDamage: 0, rounds: 0, members: [], finale: { roster, events: [], rounds: 0, totalDamage: 0 } };

  const rng = makeRng(seed);
  const attacks = new Int32Array(n);
  const damage = new Float64Array(n);
  const fell = new Int32Array(n).fill(0); // 0 = 생존, k = k라운드에 쓰러짐
  const events: WorldBossFinale['events'] = [];
  let alive: number[] = [];
  for (let i = 0; i < n; i++) alive.push(i);
  let total = 0;
  let round = 0;

  while (alive.length > 0) {
    round++;
    // ① 생존자 전원 공격(참가 순).
    for (const i of alive) {
      const dmg = Math.max(1, Math.round(units[i]!.cp * (CONQUEST_DMG_MIN + rng() * (CONQUEST_DMG_MAX - CONQUEST_DMG_MIN))));
      attacks[i]!++;
      damage[i]! += dmg;
      total += dmg;
      events.push([i, WORLD_BOSS_LOCAL, dmg, total]);
    }
    // ② 보스가 한 명을 무작위로 한 방에.
    const k = Math.floor(rng() * alive.length);
    const victim = alive[k]!;
    fell[victim] = round;
    events.push([WORLD_BOSS_LOCAL, victim, 0, round]);
    alive = alive.filter((i) => i !== victim);
  }

  const members: WorldBossMemberResult[] = units.map((u, i) => ({
    userId: u.userId,
    attacks: attacks[i]!,
    damage: Math.round(damage[i]!),
    fellRound: fell[i]! > 0 ? fell[i]! : null,
  }));
  return { totalDamage: Math.round(total), rounds: round, members, finale: { roster, events, rounds: round, totalDamage: Math.round(total) } };
}
