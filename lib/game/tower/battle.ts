/**
 * 무한의 탑 전투 — 순수 함수(docs/TOWER.md §4). DB/IO 없음, RNG 주입식(서버 crypto · 테스트 스텁).
 *
 * 대난투와 같은 문법: 체력 = 전투력 × TOWER_HP_MULT(8), 한 번 피해 = 공격자 전투력 × U(0.5, 1.2).
 * 체력 배수가 커서 비슷한 상대와는 평균 9턴을 싸운다(전투력 차이가 3배 넘으면 몇 턴 만에 끝남).
 * 같은 전투력이어도 결과가 갈리게 하는 건 판마다의 변수(선제·급소·빗나감·반격·광폭화·공명·기사회생)와 층 몬스터의 스킬이다.
 * 이 모델은 승률 곡선이 완만해 요구치 곡선을 그에 맞춰 두었다(balance.ts TOWER_REQ_BASE). 공통 변수를 바꾸면 승률 곡선이
 * 바뀌므로 곡선 시작값을 다시 맞춘다. 몬스터 스킬은 요구치를 보정하지 않는다 — 스킬 층은 일부러 다른 층보다 어려운 층으로 둔다
 * (2026-09-30 결정, 층별 체감 난이도는 docs/TOWER.md §4 표).
 *
 * 결과와 턴 기록은 서버가 한 번에 만든다 — 클라이언트는 기록을 재생만 한다(CLAUDE §3.1).
 */

import { TOWER_DMG_MAX, TOWER_DMG_MIN, TOWER_HP_MULT } from '@/lib/game/balance';

/** 0..9999 균등. */
export type Rng10k = () => number;

/** 몬스터 스킬 12종(docs/TOWER.md §4) — 층마다 0~4개(floors.ts). 일반층·수문장 모두 같은 세기. */
export type TowerSkill =
  | 'steel' // 강철 피부
  | 'freeze' // 빙결
  | 'burn' // 화상
  | 'drain' // 흡혈
  | 'multi' // 연속 공격
  | 'reflect' // 반사
  | 'regen' // 재생
  | 'seal' // 봉인
  | 'stop' // 시간 정지
  | 'death' // 즉사
  | 'rebirth' // 부활(몬스터) — 내 '기사회생'(revive)과 다르다
  | 'awe'; // 위압

export type TowerBattleEvent =
  | 'first_strike' // 선제
  | 'critical' // 급소
  | 'miss' // 빗나감
  | 'counter' // 반격
  | 'enrage' // 광폭화
  | 'resonance' // 공명
  | 'revive' // 기사회생
  | 'skill'; // 몬스터 스킬이 만든 줄(얼어 못 움직임·화상 피해·재생·반사 등) — 어떤 스킬인지는 skills

export type TowerTurn = {
  turn: number;
  actor: 'me' | 'mon';
  /** 이번 행동으로 상대가 잃은 체력(전투력 기반 절대값). 빗나감·회복 줄은 0. */
  damage: number;
  /** 변수·스킬(급소·광폭화·반격·공명·강철 피부·위압)이 붙기 전 한 번의 피해 — 기록에 'raw → damage'로 보여 준다. 변수 없는 줄엔 없음. */
  raw?: number;
  event: TowerBattleEvent | null;
  /** 이 줄에 작용한 몬스터 스킬(예: 내 공격이 강철 피부로 반감, 몬스터 공격에 흡혈·빙결이 붙음). 없으면 생략. */
  skills?: TowerSkill[];
  /** 몬스터가 회복한 체력(재생·흡혈·부활). 없으면 생략. */
  heal?: number;
  /** 행동 뒤 양쪽 체력(절대값, 최대 = 전투력 × TOWER_HP_MULT). 재생 화면의 체력 바. */
  meHp: number;
  monHp: number;
};

export type TowerBattleResult = {
  win: boolean;
  turns: TowerTurn[];
  /** 승패를 가른 줄(turns 배열 위치) — 이긴 쪽 변수 중 가장 큰 피해, 없으면 마지막 줄. */
  keyIndex: number;
};

/** 전투 변수 — 승률 곡선은 docs/TOWER.md §4 표. 바꾸면 표와 요구치 곡선을 다시 잰다. */
export const TOWER_BATTLE = {
  /** 넘기면 패배 — 배수 8에서 비슷한 상대 최대 15턴 안팎이라 사실상 닿지 않는다. */
  maxTurns: 100,
  firstStrikeBp: 5000, // 몬스터가 먼저 칠 확률
  critBp: 1200, // 급소 — 양쪽 모두(몬스터 급소는 2026-09-30 추가, 곡선 시작값 64→62로 분포 유지)
  critMul: 1.6,
  missBp: 700,
  counterBp: 800,
  counterMul: 0.5,
  enrageBp: 5500, // 몬스터 체력 35% 아래로 처음 떨어질 때 광폭화할 확률
  enrageAt: 35,
  enrageMul: 1.5,
  resonanceBp: 1500, // 장착 3개가 모두 ×2(아바타 배율 최대)일 때 내 턴마다 추가 타격 확률
  resonanceMul: 0.5,
  reviveBp: 1200, // 쓰러질 때 한 번 버틸 확률(체력 1)
} as const;

/**
 * 몬스터 스킬 수치 — 설명 문구(floors.ts TOWER_SKILL_INFO)·위키가 이 값을 읽는다.
 * 바꾸면 docs/TOWER.md §4의 스킬별 체감 난이도 표를 다시 잰다.
 */
export const TOWER_SKILL = {
  steel: { hits: 2, mul: 0.5 }, // 전투 시작 후 내 공격 N번은 피해 ×mul(반격·공명 포함)
  freeze: { bp: 2000, minTurns: 1, maxTurns: 3 }, // 몬스터 공격이 맞으면 확률로 N턴 동안 내가 행동하지 못함
  burn: { turns: 3, pct: 3 }, // 맞으면 N턴 동안 내 차례마다 내 최대 체력의 pct%씩 추가로 잃음(다시 맞으면 새로 N턴)
  drain: { pct: 30 }, // 몬스터가 준 피해의 pct%만큼 회복
  multi: { bp: 2500, mul: 0.6 }, // 몬스터 공격 뒤 확률로 한 번 더(피해 ×mul)
  reflect: { pct: 30 }, // 내 급소 피해의 pct%가 나에게 되돌아옴
  regen: { pct: 4 }, // 몬스터가 차례마다 최대 체력의 pct% 회복
  seal: {}, // 내 급소·공명·반격이 발동하지 않음
  stop: { at: 50, turns: 3 }, // 몬스터 체력 at% 아래에서 첫 공격 때 한 번, N턴 동안 내가 행동하지 못함
  death: { bp: 500 }, // 몬스터 공격 때 확률로 내 체력을 0으로(기사회생으로 버틸 수 있음)
  rebirth: { pct: 30 }, // 몬스터가 쓰러질 때 한 번 최대 체력 pct%로 일어남
  awe: { turns: 3, mul: 0.7 }, // 전투 시작 N턴 동안 내 피해 ×mul
} as const;

export function simulateTowerBattle(opts: {
  towerCp: number;
  requirement: number;
  /** 고른 아바타와 맞는(×2) 장착 장비 수 — 3개 모두(아바타 배율 최대)면 공명 발동 가능. */
  doubledCount: number;
  /** 층 몬스터 스킬(floors.ts towerFloorSkills). 없으면 스킬 없는 층. */
  skills?: readonly TowerSkill[];
  rng: Rng10k;
}): TowerBattleResult {
  const B = TOWER_BATTLE;
  const K = TOWER_SKILL;
  const { rng } = opts;
  const has = new Set(opts.skills ?? []);
  const myCp = Math.max(0, opts.towerCp);
  const monCp = Math.max(0, opts.requirement);
  const turns: TowerTurn[] = [];
  const meMax = myCp * TOWER_HP_MULT;
  const monMax = monCp * TOWER_HP_MULT;
  let me: number = meMax;
  let mon: number = monMax;
  let enraged = false;
  let enrageChecked = false;
  let revived = false;
  let reborn = false;
  let steelLeft: number = has.has('steel') ? K.steel.hits : 0;
  let frozenLeft = 0;
  let stoppedLeft = 0;
  let stopUsed = false;
  let burnLeft = 0;
  const sealed = has.has('seal');
  const roll = (bp: number) => rng() < bp;
  const u = () => TOWER_DMG_MIN + (rng() / 9999) * (TOWER_DMG_MAX - TOWER_DMG_MIN);
  // 한 번 피해(변수 전) — 공격자 전투력 × U, 변수 배율은 쓰는 쪽에서. 남은 체력으로 자르지 않는다 — 마지막 일격도 실제 피해 그대로
  // 보여 준다(전투력 차이가 크면 최대 체력보다 큰 숫자). 체력은 기록할 때 0 아래로 내려가지 않는다(승패 판정은 같다).
  const myRaw = () => myCp * u();
  const monRaw = () => monCp * u();
  const round = (x: number) => Math.round(x);

  const push = (
    turn: number, actor: 'me' | 'mon', damage: number, event: TowerBattleEvent | null,
    extra: { raw?: number; skills?: TowerSkill[]; heal?: number } = {},
  ) =>
    turns.push({
      turn, actor, damage: round(damage), event, meHp: round(Math.max(0, me)), monHp: round(Math.max(0, mon)),
      ...(extra.raw != null ? { raw: round(extra.raw) } : {}),
      ...(extra.skills?.length ? { skills: extra.skills } : {}),
      ...(extra.heal != null ? { heal: round(extra.heal) } : {}),
    });

  /** 몬스터 회복 — 최대 체력을 넘지 않는다. 실제로 오른 양. */
  const healMon = (amount: number) => {
    const h = Math.max(0, Math.min(amount, monMax - mon));
    mon += h;
    return h;
  };
  /** 내 피해에 몬스터 스킬 적용(위압·강철 피부) — 배율과 붙은 스킬. */
  const myMods = (turn: number) => {
    let mul = 1;
    const sk: TowerSkill[] = [];
    if (has.has('awe') && turn <= K.awe.turns) {
      mul *= K.awe.mul;
      sk.push('awe');
    }
    if (steelLeft > 0) {
      steelLeft -= 1;
      mul *= K.steel.mul;
      sk.push('steel');
    }
    return { mul, sk };
  };
  /** 몬스터가 쓰러졌을 때 부활(한 번). */
  const checkRebirth = (turn: number) => {
    if (mon > 0 || reborn || !has.has('rebirth')) return;
    reborn = true;
    mon = 0;
    const h = healMon((monMax * K.rebirth.pct) / 100);
    push(turn, 'mon', 0, 'skill', { skills: ['rebirth'], heal: h });
  };
  /** 내가 쓰러질 피해를 받은 직후 — 기사회생(한 번)이면 체력 1. 버텼으면 true. */
  const tryRevive = () => {
    if (me > 0 || revived || !roll(B.reviveBp)) return false;
    revived = true;
    me = 1;
    return true;
  };
  /** 내 추가 피해(반격·공명) — 변수 전 피해의 mul배, 몬스터 스킬 배율도 받는다. */
  const myExtra = (turn: number, ev: 'counter' | 'resonance', mulBase: number) => {
    const raw2 = myRaw();
    const m = myMods(turn);
    const dmg = raw2 * mulBase * m.mul;
    mon -= dmg;
    push(turn, 'me', dmg, ev, { raw: raw2, skills: m.sk });
    checkRebirth(turn);
  };

  const meAct = (turn: number, first: boolean) => {
    // 화상 — 내 차례가 올 때마다 먼저 탄다.
    if (burnLeft > 0) {
      burnLeft -= 1;
      const tick = (meMax * K.burn.pct) / 100;
      me -= tick;
      const saved = tryRevive();
      push(turn, 'mon', tick, saved ? 'revive' : 'skill', { skills: ['burn'] });
      if (me <= 0) return;
    }
    // 빙결·시간 정지 — 이번 차례를 통째로 쉰다.
    if (frozenLeft > 0 || stoppedLeft > 0) {
      const sk: TowerSkill = frozenLeft > 0 ? 'freeze' : 'stop';
      if (frozenLeft > 0) frozenLeft -= 1;
      else stoppedLeft -= 1;
      return push(turn, 'me', 0, 'skill', { skills: [sk] });
    }
    if (roll(B.missBp)) return push(turn, 'me', 0, 'miss');
    const crit = !sealed && roll(B.critBp);
    const raw = myRaw();
    const m = myMods(turn);
    const dmg = raw * (crit ? B.critMul : 1) * m.mul;
    mon -= dmg;
    push(turn, 'me', dmg, crit ? 'critical' : first ? 'first_strike' : null, { raw: crit || m.sk.length ? raw : undefined, skills: m.sk });
    // 반사 — 내 급소 피해 일부가 되돌아온다. 그 급소로 몬스터를 쓰러뜨렸으면 없다(10-01: 쓰러뜨린 한 방이 반사로 패배가 되던 문제).
    if (crit && has.has('reflect') && me > 0 && mon > 0) {
      const back = (dmg * K.reflect.pct) / 100;
      me -= back;
      const saved = tryRevive();
      push(turn, 'mon', back, saved ? 'revive' : 'skill', { skills: ['reflect'] });
      if (me <= 0) return;
    }
    checkRebirth(turn);
    if (mon > 0 && !sealed && opts.doubledCount >= 3 && roll(B.resonanceBp)) myExtra(turn, 'resonance', B.resonanceMul);
  };

  /** 몬스터 한 번 공격(본 공격·연속 공격) — 피해 적용, 흡혈, 기사회생. 맞았으면 true. */
  const monHit = (turn: number, dmg: number, event: TowerBattleEvent | null, raw: number | undefined, sk: TowerSkill[]) => {
    me -= dmg;
    let heal: number | undefined;
    if (has.has('drain') && dmg > 0) {
      heal = healMon((dmg * K.drain.pct) / 100);
      sk.push('drain');
    }
    const saved = tryRevive();
    push(turn, 'mon', dmg, saved ? 'revive' : event, { raw: saved ? undefined : raw, skills: sk, heal });
  };

  const monAct = (turn: number, first: boolean) => {
    // 재생 — 몬스터 차례마다 먼저 회복.
    if (has.has('regen') && mon < monMax) {
      const h = healMon((monMax * K.regen.pct) / 100);
      if (h > 0) push(turn, 'mon', 0, 'skill', { skills: ['regen'], heal: h });
    }
    if (!enrageChecked && mon < (monMax * B.enrageAt) / 100) {
      enrageChecked = true;
      enraged = roll(B.enrageBp);
    }
    if (roll(B.missBp)) return push(turn, 'mon', 0, 'miss');
    // 즉사 — 맞으면 남은 체력 전부(기사회생으로만 버틴다).
    if (has.has('death') && roll(K.death.bp)) {
      monHit(turn, Math.max(0, me), 'skill', undefined, ['death']);
    } else {
      // 몬스터도 급소가 있다(2026-09-30) — 광폭화와 겹치면 두 배율을 곱한다. 기록 표시는 급소가 우선.
      const crit = roll(B.critBp);
      const raw = monRaw();
      const dmg = raw * (enraged ? B.enrageMul : 1) * (crit ? B.critMul : 1);
      const sk: TowerSkill[] = [];
      // 빙결·화상·시간 정지는 맞은 공격에 붙는다(이미 쓰러졌으면 의미 없음).
      const alive = me - dmg > 0;
      if (alive && has.has('freeze') && frozenLeft === 0 && roll(K.freeze.bp)) {
        frozenLeft = K.freeze.minTurns + Math.floor((rng() / 10000) * (K.freeze.maxTurns - K.freeze.minTurns + 1));
        sk.push('freeze');
      }
      if (alive && has.has('burn')) {
        burnLeft = K.burn.turns;
        sk.push('burn');
      }
      if (alive && has.has('stop') && !stopUsed && mon < (monMax * K.stop.at) / 100) {
        stopUsed = true;
        stoppedLeft = K.stop.turns;
        sk.push('stop');
      }
      monHit(turn, dmg, crit ? 'critical' : enraged ? 'enrage' : first ? 'first_strike' : null, crit || enraged ? raw : undefined, sk);
    }
    if (me <= 0) return;
    // 연속 공격 — 한 번 더(흡혈은 붙고, 빙결·화상은 본 공격에서만).
    if (has.has('multi') && roll(K.multi.bp)) {
      const raw2 = monRaw();
      monHit(turn, raw2 * K.multi.mul, 'skill', raw2, ['multi']);
      if (me <= 0) return;
    }
    // 반격 — 봉인이면 없고, 얼었거나 멈춘 동안에도 없다.
    if (mon > 0 && !sealed && frozenLeft === 0 && stoppedLeft === 0 && roll(B.counterBp)) myExtra(turn, 'counter', B.counterMul);
  };

  const monFirst = roll(B.firstStrikeBp);
  for (let t = 1; t <= B.maxTurns && me > 0 && mon > 0; t++) {
    if (monFirst) {
      monAct(t, t === 1);
      if (me > 0 && mon > 0) meAct(t, false);
    } else {
      meAct(t, t === 1);
      if (me > 0 && mon > 0) monAct(t, false);
    }
  }
  const win = mon <= 0 && me > 0 && myCp > 0;
  // 승패를 가른 줄 — 진 판은 몬스터 쪽 변수·스킬 중 가장 큰 피해, 이긴 판은 내 쪽 변수 중 가장 큰 피해.
  // 진 판은 몬스터 쪽 변수만(기사회생은 내가 버틴 장면이라 패배 원인이 아니다).
  const side = win ? 'me' : 'mon';
  let key = Math.max(0, turns.length - 1);
  let bestDmg = -1;
  turns.forEach((x, i) => {
    if (x.actor === side && x.event && x.event !== 'miss' && x.event !== 'revive' && x.damage > bestDmg) {
      bestDmg = x.damage;
      key = i;
    }
  });
  return { win, turns, keyIndex: key };
}
