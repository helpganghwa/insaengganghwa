/**
 * 무한의 탑 전투 — 순수 함수(docs/TOWER.md §4). DB/IO 없음, RNG 주입식(서버 crypto · 테스트 스텁).
 *
 * 대난투와 같은 문법: 체력 = 전투력 × TOWER_HP_MULT(8), 한 번 피해 = 공격자 전투력 × U(0.5, 1.2).
 * 체력 배수가 커서 비슷한 상대와는 평균 9턴을 싸운다(전투력 차이가 3배 넘으면 몇 턴 만에 끝남).
 * 같은 전투력이어도 결과가 갈리게 하는 건 판마다의 변수(선제·급소·빗나감·반격·광폭화·공명·기사회생)다.
 * 이 모델은 승률 곡선이 완만해(요구치 0.9배 20% · 1.1배 85%) 요구치 곡선을 그에 맞춰 올려 두었다(balance.ts TOWER_REQ_BASE).
 *
 * 결과와 턴 기록은 서버가 한 번에 만든다 — 클라이언트는 기록을 재생만 한다(CLAUDE §3.1).
 */

import { TOWER_DMG_MAX, TOWER_DMG_MIN, TOWER_HP_MULT } from '@/lib/game/balance';

/** 0..9999 균등. */
export type Rng10k = () => number;

export type TowerBattleEvent =
  | 'first_strike' // 선제
  | 'critical' // 급소
  | 'miss' // 빗나감
  | 'counter' // 반격
  | 'enrage' // 광폭화
  | 'resonance' // 공명
  | 'revive'; // 기사회생

export type TowerTurn = {
  turn: number;
  actor: 'me' | 'mon';
  /** 이번 행동으로 상대가 잃은 체력(전투력 기반 절대값). 빗나감은 0. */
  damage: number;
  /** 변수(급소·광폭화·반격·공명)가 붙기 전 한 번의 피해 — 기록에 'raw → damage'로 보여 준다. 변수 없는 줄엔 없음. */
  raw?: number;
  event: TowerBattleEvent | null;
  /** 행동 뒤 양쪽 체력(절대값, 최대 = 전투력 × TOWER_HP_MULT). 재생 화면의 체력 바. */
  meHp: number;
  monHp: number;
};

export type TowerBattleResult = {
  win: boolean;
  turns: TowerTurn[];
  /** 승패를 가른 줄(turns 배열 위치, 실패 팝업 "결정적인 순간") — 이긴 쪽 변수 중 가장 큰 피해, 없으면 마지막 줄. */
  keyIndex: number;
};

/** 전투 변수 — 승률 곡선은 docs/TOWER.md §4 표. 바꾸면 표와 요구치 곡선을 다시 잰다. */
export const TOWER_BATTLE = {
  /** 넘기면 패배 — 배수 8에서 비슷한 상대 최대 15턴 안팎이라 사실상 닿지 않는다. */
  maxTurns: 100,
  firstStrikeBp: 5000, // 몬스터가 먼저 칠 확률
  critBp: 1200,
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

export function simulateTowerBattle(opts: {
  towerCp: number;
  requirement: number;
  /** 고른 아바타와 맞는(×2) 장착 장비 수 — 3개 모두(아바타 배율 최대)면 공명 발동 가능. */
  doubledCount: number;
  rng: Rng10k;
}): TowerBattleResult {
  const B = TOWER_BATTLE;
  const { rng } = opts;
  const myCp = Math.max(0, opts.towerCp);
  const monCp = Math.max(0, opts.requirement);
  const turns: TowerTurn[] = [];
  const monMax = monCp * TOWER_HP_MULT;
  let me: number = myCp * TOWER_HP_MULT;
  let mon: number = monMax;
  let enraged = false;
  let enrageChecked = false;
  let revived = false;
  const roll = (bp: number) => rng() < bp;
  const u = () => TOWER_DMG_MIN + (rng() / 9999) * (TOWER_DMG_MAX - TOWER_DMG_MIN);
  // 한 번 피해(변수 전) — 공격자 전투력 × U. 변수 배율과 남은 체력 상한은 쓰는 쪽에서.
  const myRaw = () => myCp * u();
  const monRaw = () => monCp * u();
  const round = (x: number) => Math.round(x);

  const push = (turn: number, actor: 'me' | 'mon', damage: number, event: TowerBattleEvent | null, raw?: number) =>
    turns.push({
      turn, actor, damage: round(damage), event, meHp: round(Math.max(0, me)), monHp: round(Math.max(0, mon)),
      ...(raw != null ? { raw: round(raw) } : {}),
    });

  const meAct = (turn: number, first: boolean) => {
    if (roll(B.missBp)) return push(turn, 'me', 0, 'miss');
    const crit = roll(B.critBp);
    const raw = myRaw();
    const dmg = Math.min(raw * (crit ? B.critMul : 1), mon);
    mon -= dmg;
    push(turn, 'me', dmg, crit ? 'critical' : first ? 'first_strike' : null, crit ? raw : undefined);
    if (mon > 0 && opts.doubledCount >= 3 && roll(B.resonanceBp)) {
      const raw2 = myRaw();
      const extra = Math.min(raw2 * B.resonanceMul, mon);
      mon -= extra;
      push(turn, 'me', extra, 'resonance', raw2);
    }
  };
  const monAct = (turn: number, first: boolean) => {
    if (!enrageChecked && mon < (monMax * B.enrageAt) / 100) {
      enrageChecked = true;
      enraged = roll(B.enrageBp);
    }
    if (roll(B.missBp)) return push(turn, 'mon', 0, 'miss');
    const raw = monRaw();
    const dmg = Math.min(raw * (enraged ? B.enrageMul : 1), me);
    me -= dmg;
    if (me <= 0 && !revived && roll(B.reviveBp)) {
      revived = true;
      me = 1;
      push(turn, 'mon', dmg, 'revive');
    } else {
      push(turn, 'mon', dmg, enraged ? 'enrage' : first ? 'first_strike' : null, enraged ? raw : undefined);
    }
    if (me > 0 && mon > 0 && roll(B.counterBp)) {
      const raw2 = myRaw();
      const c = Math.min(raw2 * B.counterMul, mon);
      mon -= c;
      push(turn, 'me', c, 'counter', raw2);
    }
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
  // 결정적인 순간 — 진 판은 몬스터 쪽 변수(광폭화 등) 중 가장 큰 피해, 이긴 판은 내 쪽 변수 중 가장 큰 피해.
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
