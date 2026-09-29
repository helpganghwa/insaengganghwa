/**
 * 무한의 탑 전투 — 순수 함수(docs/TOWER.md §4). DB/IO 없음, RNG 주입식(서버 crypto · 테스트 스텁).
 *
 * 체력은 양쪽 모두 100(백분율)으로 두고, 한 번에 주는 피해를 전투력 비율 r = 탑 전투력 ÷ 층 요구치로 정한다.
 * r이 1이면 대등(승률 절반 근처), 1보다 작으면 빠르게 불리해진다 — 하루 3번·매일 다시 도전할 수 있어
 * 요구치보다 확실히 약한데 이길 여지가 크면 곡선이 무너진다(며칠 반복하면 결국 넘는다).
 * 같은 전투력이어도 결과가 갈리게 하는 건 판마다의 변수(선제·급소·빗나감·반격·광폭화·공명·기사회생)다.
 *
 * 결과와 턴 기록은 서버가 한 번에 만든다 — 클라이언트는 기록을 재생만 한다(CLAUDE §3.1).
 */

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
  /** 이번 행동으로 상대가 잃은 체력(%p). 빗나감은 0. */
  damage: number;
  event: TowerBattleEvent | null;
  /** 행동 뒤 양쪽 체력(0~100). 재생 화면의 체력 바. */
  meHp: number;
  monHp: number;
};

export type TowerBattleResult = {
  win: boolean;
  turns: TowerTurn[];
  /** 승패를 가른 줄(turns 배열 위치, 실패 팝업 "결정적인 순간") — 이긴 쪽 변수 중 가장 큰 피해, 없으면 마지막 줄. */
  keyIndex: number;
};

/** 전투 상수 — 승률 곡선은 docs/TOWER.md §4 표. 바꾸면 표도 다시 잰다. */
export const TOWER_BATTLE = {
  hp: 100,
  /** 대등(r=1)일 때 한 번의 피해(%p). */
  baseHit: 22,
  /** 피해 = baseHit × r^steep(내 공격) / r^steep(몬스터 공격) — 클수록 승률 곡선이 가파르다. */
  steep: 2.2,
  /** 피해 흔들림 ±(bp/10000). */
  spreadBp: 1000,
  /** 넘기면 패배 — 사실상 체력으로 끝나도록 넉넉히(2026-09-29, 14 → 100). */
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
  reviveBp: 1200, // 쓰러질 때 한 번 버틸 확률
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
  const r = opts.requirement > 0 ? Math.max(0, opts.towerCp) / opts.requirement : 0;
  const turns: TowerTurn[] = [];
  let me: number = B.hp;
  let mon: number = B.hp;
  let enraged = false;
  let enrageChecked = false;
  let revived = false;
  const roll = (bp: number) => rng() < bp;
  const spread = () => 1 + ((rng() / 9999) * 2 - 1) * (B.spreadBp / 10000);
  // 피해는 상대의 남은 체력까지만 — 전투력 차이가 크면 계산상 수십억이 나와 기록·화면이 무의미해진다(승패·확률은 같음).
  const myHit = () => Math.min(B.baseHit * Math.pow(r, B.steep) * spread(), Math.max(0, mon));
  const monHit = () => Math.min(r > 0 ? (B.baseHit / Math.pow(r, B.steep)) * spread() : B.hp, Math.max(0, me));
  const round = (x: number) => Math.round(x * 10) / 10;

  const push = (turn: number, actor: 'me' | 'mon', damage: number, event: TowerBattleEvent | null) =>
    turns.push({ turn, actor, damage: round(damage), event, meHp: round(Math.max(0, me)), monHp: round(Math.max(0, mon)) });

  const meAct = (turn: number, first: boolean) => {
    if (roll(B.missBp)) return push(turn, 'me', 0, 'miss');
    const crit = roll(B.critBp);
    const dmg = Math.min(myHit() * (crit ? B.critMul : 1), mon);
    mon -= dmg;
    push(turn, 'me', dmg, crit ? 'critical' : first ? 'first_strike' : null);
    if (mon > 0 && opts.doubledCount >= 3 && roll(B.resonanceBp)) {
      const extra = Math.min(myHit() * B.resonanceMul, mon);
      mon -= extra;
      push(turn, 'me', extra, 'resonance');
    }
  };
  const monAct = (turn: number, first: boolean) => {
    if (!enrageChecked && mon < B.enrageAt) {
      enrageChecked = true;
      enraged = roll(B.enrageBp);
    }
    if (roll(B.missBp)) return push(turn, 'mon', 0, 'miss');
    const dmg = Math.min(monHit() * (enraged ? B.enrageMul : 1), me);
    me -= dmg;
    if (me <= 0 && !revived && roll(B.reviveBp)) {
      revived = true;
      me = 1;
      push(turn, 'mon', dmg, 'revive');
    } else {
      push(turn, 'mon', dmg, enraged ? 'enrage' : first ? 'first_strike' : null);
    }
    if (me > 0 && mon > 0 && roll(B.counterBp)) {
      const c = Math.min(myHit() * B.counterMul, mon);
      mon -= c;
      push(turn, 'me', c, 'counter');
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
  const win = mon <= 0 && me > 0;
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
