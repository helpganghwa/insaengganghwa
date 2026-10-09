/**
 * 월드보스 결정론 시뮬 — docs/WORLD-BOSS.md §3. 순수 함수(출발 트랜잭션에서 호출, Vitest 검증).
 *
 * 라운드제: 살아 있는 원정대원이 **모두 한 번씩 먼저** 공격 → 보스가 원정대원 한 명을 무작위로 **한 방에** 쓰러뜨린다
 * (1라운드부터). 모두 쓰러지면 끝. 1인 평균 공격 횟수 = (인원+1)÷2. 보스 체력은 끝이 없어 '처치'는 없다.
 *
 * 한 번의 공격 피해 = Σ(장착 장비 전투력 × (1 + 아바타 + 약점)) × U(CONQUEST_DMG_MIN, MAX).
 *  - 아바타 +50%: 대표 아바타를 만들 때 입은 장비와 같은 장비. 커스텀 아바타가 있으면 약점 장비로 갈아입은 부위도 유지.
 *  - 약점 +100%: 그 공격 순간 보스 페이즈(공격 중인 단계로 정함 — 공격마다 누적 피해로 다시 센다)의 약점 장비.
 *  - 약점을 2개 이상 맞힌 공격은 공격 보상 꽝이 줄어든다(행운, worldBossRollDrop lucky).
 *  - 처음 맞힌 약점은 공개 목록(reveals)에 담는다 — 호출부가 보스 단위로 처음인 것만 저장한다.
 *
 * 기록(finale)은 점령전과 같은 4칸 튜플 — 보스는 로컬 인덱스 -1:
 *  - 공격: [공격자, -1, 피해, 누적 피해] · 쓰러짐: [-1, 대상, 0, 라운드]
 * drops[k]·weak[k]는 events[k]와 짝(쓰러짐은 [0,0]·0). weak[k] = 그 공격에서 약점을 맞힌 부위 비트(무기 1·방어구 2·장신구 4).
 * 보상 난수는 피해와 따로 노는 줄기(seed + ':drop').
 */
import { CONQUEST_DMG_MAX, CONQUEST_DMG_MIN, WORLD_BOSS_AVATAR_BONUS, WORLD_BOSS_LUCKY_MIN_WEAK, WORLD_BOSS_WEAK_BONUS, worldBossPhaseOf, worldBossRollDrop, worldBossStageFor } from '@/lib/game/guild/balance';
import type { WorldBossWeakPhase } from '@/lib/db/schema/world-boss';
import { makeRng } from '@/lib/game/melee/rng';

import { SLOT_BIT, type WeakSlot } from './weak';

export const WORLD_BOSS_LOCAL = -1;

export type WorldBossItem = { slot: WeakSlot; code: string; cp: number; /** 대표 아바타를 만들 때 입은 장비와 같은가. */ av: boolean };

export type WorldBossUnit = {
  userId: string;
  nickname: string;
  /** 장착 장비(출발 시점 스냅샷). 비어 있으면 피해 0 — 공격 보상은 그대로 뽑는다. */
  items: WorldBossItem[];
  /** 커스텀 대표 아바타가 있는가(기본 아바타면 false) — 약점 장비 부위의 아바타 보너스 유지 조건. */
  hasAvatar: boolean;
  guildId: string | null;
  guildName: string | null;
};

export type WorldBossRosterEntry = {
  userId: string;
  nickname: string;
  /** 장착 장비 전투력 합(보너스 전) — 표시용. */
  cp: number;
  guildId: string | null;
  guildName: string | null;
  items?: WorldBossItem[];
  hasAvatar?: boolean;
};

export type WorldBossFinale = {
  roster: WorldBossRosterEntry[];
  events: Array<[number, number, number, number]>;
  drops?: Array<[number, number]>;
  /** events와 같은 길이 — 공격에서 약점을 맞힌 부위 비트. 옛 기록엔 없다. */
  weak?: number[];
  rounds: number;
  totalDamage: number;
};

export type WorldBossReveal = { phase: number; slot: WeakSlot; code: string; unit: number };

export type WorldBossMemberResult = { userId: string; attacks: number; damage: number; fellRound: number | null; diamond: number; boxes: number; weakHits: number };

export type WorldBossSimResult = {
  totalDamage: number;
  rounds: number;
  members: WorldBossMemberResult[];
  reveals: WorldBossReveal[];
  finale: WorldBossFinale;
};

export type WorldBossSimContext = {
  /** 출발 전 보스 누적 피해 — 공격마다 이 값 + 지금까지 피해로 공격 중인 단계(→ 페이즈)를 센다. */
  startDamage: number;
  /** 페이즈별 약점(빈 배열이면 약점 없음). */
  weak: readonly WorldBossWeakPhase[];
};

export function baseCp(items: readonly WorldBossItem[]): number {
  return items.reduce((s, it) => s + it.cp, 0);
}

export function simulateWorldBoss(units: readonly WorldBossUnit[], seed: string, ctx: WorldBossSimContext = { startDamage: 0, weak: [] }): WorldBossSimResult {
  const n = units.length;
  const roster: WorldBossRosterEntry[] = units.map((u) => ({
    userId: u.userId, nickname: u.nickname, cp: Math.round(baseCp(u.items)), guildId: u.guildId, guildName: u.guildName, items: u.items, hasAvatar: u.hasAvatar,
  }));
  if (n === 0) return { totalDamage: 0, rounds: 0, members: [], reveals: [], finale: { roster, events: [], drops: [], weak: [], rounds: 0, totalDamage: 0 } };

  const weakSets = ctx.weak.map((p) => ({ weapon: new Set(p.weapon), armor: new Set(p.armor), accessory: new Set(p.accessory) }));
  const rng = makeRng(seed);
  const dropRng = makeRng(`${seed}:drop`);
  const dia = new Float64Array(n);
  const box = new Float64Array(n);
  const hits = new Int32Array(n);
  const drops: NonNullable<WorldBossFinale['drops']> = [];
  const weakBits: number[] = [];
  const attacks = new Int32Array(n);
  const damage = new Float64Array(n);
  const fell = new Int32Array(n).fill(0);
  const events: WorldBossFinale['events'] = [];
  const reveals: WorldBossReveal[] = [];
  const seen = new Set<string>();
  let alive: number[] = [];
  for (let i = 0; i < n; i++) alive.push(i);
  let total = 0;
  let round = 0;

  while (alive.length > 0) {
    round++;
    for (const i of alive) {
      const u = units[i]!;
      const phase = worldBossPhaseOf(worldBossStageFor(ctx.startDamage + total).stage + 1);
      const ws = weakSets[Math.min(phase, weakSets.length - 1)];
      let eff = 0;
      let bits = 0;
      let nWeak = 0;
      for (const it of u.items) {
        const weak = !!ws && ws[it.slot].has(it.code);
        if (weak) {
          nWeak++;
          bits |= SLOT_BIT[it.slot];
          const key = `${phase}:${it.code}`;
          if (!seen.has(key)) {
            seen.add(key);
            reveals.push({ phase, slot: it.slot, code: it.code, unit: i });
          }
        }
        const av = it.av || (u.hasAvatar && weak);
        eff += it.cp * (1 + (av ? WORLD_BOSS_AVATAR_BONUS : 0) + (weak ? WORLD_BOSS_WEAK_BONUS : 0));
      }
      // 난수는 피해가 0이어도 하나 소비한다 — 장착 여부로 뒤 공격들의 흐름이 바뀌지 않게.
      const u01 = rng();
      const dmg = eff > 0 ? Math.max(1, Math.round(eff * (CONQUEST_DMG_MIN + u01 * (CONQUEST_DMG_MAX - CONQUEST_DMG_MIN)))) : 0;
      attacks[i]!++;
      damage[i]! += dmg;
      hits[i]! += nWeak;
      total += dmg;
      events.push([i, WORLD_BOSS_LOCAL, dmg, total]);
      weakBits.push(bits);
      const dr = worldBossRollDrop(dropRng(), nWeak >= WORLD_BOSS_LUCKY_MIN_WEAK);
      dia[i]! += dr.diamond;
      box[i]! += dr.boxes;
      drops.push([dr.diamond, dr.boxes]);
    }
    const k = Math.floor(rng() * alive.length);
    const victim = alive[k]!;
    fell[victim] = round;
    events.push([WORLD_BOSS_LOCAL, victim, 0, round]);
    drops.push([0, 0]);
    weakBits.push(0);
    alive = alive.filter((i) => i !== victim);
  }

  const members: WorldBossMemberResult[] = units.map((u, i) => ({
    userId: u.userId,
    attacks: attacks[i]!,
    damage: Math.round(damage[i]!),
    fellRound: fell[i]! > 0 ? fell[i]! : null,
    diamond: dia[i]!,
    boxes: box[i]!,
    weakHits: hits[i]!,
  }));
  return { totalDamage: Math.round(total), rounds: round, members, reveals, finale: { roster, events, drops, weak: weakBits, rounds: round, totalDamage: Math.round(total) } };
}
