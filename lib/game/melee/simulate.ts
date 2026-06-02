/**
 * 대난투 결정론 시뮬 — MELEE §4. 순수 함수(서버 cron에서 호출, Vitest 검증).
 *
 * 체인 난투: 매 라운드 공격자 1명이 타겟 1명을 1회 타격(누적 차감, 항상 명중).
 *  - 타겟 생존 → 그 타겟이 다음 공격자(반격 체인)
 *  - 타겟 패배 → 등수 기록(첫 탈락 = N위, 역순) + killer 기록 → 새 랜덤 공격자
 *  - 마지막 생존자 = 1위(챔피언)
 * HP = 전투력 × MELEE_HP_MULT. 데미지 = 공격자 전투력 × U(MIN,MAX)(최소 1).
 *
 * 리플레이: 총 라운드 ≤ MELEE_REPLAY_ROUNDS면 전체, 초과면 **마지막 그만큼**(클라이맥스).
 * 링 버퍼로 O(REPLAY) 메모리 — N무관. finale는 등장 유저 로컬 인덱스로 압축.
 */
import {
  MELEE_HP_MULT,
  MELEE_DMG_MIN,
  MELEE_DMG_MAX,
  MELEE_REPLAY_ROUNDS,
  MELEE_MY_EVENTS_MAX,
} from '@/lib/game/balance';
import type { MeleeFinale, MeleeMyEvent } from '@/lib/db/schema/melee';

import { makeRng } from './rng';

export type MeleeParticipantInput = { userId: string; nickname: string; cp: number };
export type MeleeRankResult = {
  userId: string;
  finalRank: number;
  killerUserId: string | null;
  /** "내 전투" 미니로그(본인 관여 이벤트, 최대 MELEE_MY_EVENTS_MAX). */
  events: MeleeMyEvent[];
  /** 총 공격(공격자였던 라운드) / 방어(타겟이었던 라운드) 횟수. */
  attackCount: number;
  defenseCount: number;
};
export type MeleeSimResult = {
  ranks: MeleeRankResult[];
  championUserId: string;
  finale: MeleeFinale;
};

export function simulateMelee(
  participants: readonly MeleeParticipantInput[],
  seed: string,
): MeleeSimResult {
  const n = participants.length;
  if (n === 0) return { ranks: [], championUserId: '', finale: { roster: [], events: [] } };
  if (n === 1) {
    const p = participants[0]!;
    return {
      ranks: [
        { userId: p.userId, finalRank: 1, killerUserId: null, events: [], attackCount: 0, defenseCount: 0 },
      ],
      championUserId: p.userId,
      finale: { roster: [{ userId: p.userId, nickname: p.nickname, cp: p.cp, rank: 1 }], events: [] },
    };
  }

  const rng = makeRng(seed);
  const cp = participants.map((p) => p.cp);
  const hp = new Float64Array(n);
  for (let i = 0; i < n; i++) hp[i] = cp[i]! * MELEE_HP_MULT;

  const finalRank = new Int32Array(n); // 0 = 미정
  const killer = new Int32Array(n).fill(-1); // -1 = 없음(챔피언)
  const alive: number[] = [];
  for (let i = 0; i < n; i++) alive.push(i);

  // 링 버퍼 — 마지막 REPLAY 라운드만 보존(O(REPLAY), N무관).
  const REPLAY = MELEE_REPLAY_ROUNDS;
  const rA = new Int32Array(REPLAY);
  const rT = new Int32Array(REPLAY);
  const rD = new Int32Array(REPLAY);
  const rH = new Int32Array(REPLAY); // 타격 후 타겟 잔여HP(≤0 = 탈락)
  let rounds = 0; // 총 라운드 수

  const atkCnt = new Int32Array(n); // 공격 횟수
  const defCnt = new Int32Array(n); // 방어(피격) 횟수
  // 참가자별 "내 전투" 미니로그(본인 관여 이벤트만, 상한 캡).
  const myEv: MeleeMyEvent[][] = Array.from({ length: n }, () => []);
  const pushMy = (i: number, ev: MeleeMyEvent) => {
    const a = myEv[i]!;
    a.push(ev);
    if (a.length > MELEE_MY_EVENTS_MAX) a.shift();
  };

  let attacker = -1; // 참가자 인덱스. -1 = 새로 뽑아야 함(체인 종료/시작)
  let worstRank = n;

  while (alive.length > 1) {
    if (attacker < 0) attacker = alive[Math.floor(rng() * alive.length)]!;
    let ti = Math.floor(rng() * alive.length);
    if (alive[ti] === attacker) ti = (ti + 1) % alive.length;
    const target = alive[ti]!;

    const dmg = Math.max(
      1,
      Math.round(cp[attacker]! * (MELEE_DMG_MIN + rng() * (MELEE_DMG_MAX - MELEE_DMG_MIN))),
    );
    hp[target]! -= dmg;
    const killed = hp[target]! <= 0;
    const hpAfter = Math.round(hp[target]!); // 타격 후 타겟 잔여HP(≤0 = 탈락)

    const slot = rounds % REPLAY;
    rA[slot] = attacker;
    rT[slot] = target;
    rD[slot] = dmg;
    rH[slot] = hpAfter;
    rounds++;

    atkCnt[attacker]!++;
    defCnt[target]!++;
    // 내 전투 미니로그 — 공격자/타겟 양쪽 본인 관점으로 기록.
    pushMy(attacker, [0, participants[target]!.nickname, dmg, hpAfter]);
    pushMy(target, [1, participants[attacker]!.nickname, dmg, hpAfter]);

    if (killed) {
      finalRank[target] = worstRank;
      killer[target] = attacker;
      worstRank--;
      alive[ti] = alive[alive.length - 1]!; // swap-remove
      alive.pop();
      attacker = -1; // 체인 종료 → 새 랜덤 공격자
    } else {
      attacker = target; // 생존자가 다음 공격자
    }
  }

  const champ = alive[0]!;
  finalRank[champ] = 1;
  killer[champ] = -1;

  const ranks: MeleeRankResult[] = participants.map((p, i) => ({
    userId: p.userId,
    finalRank: finalRank[i]!,
    killerUserId: killer[i]! < 0 ? null : participants[killer[i]!]!.userId,
    events: myEv[i]!,
    attackCount: atkCnt[i]!,
    defenseCount: defCnt[i]!,
  }));

  // 링 버퍼 → 시간순 마지막 min(rounds, REPLAY)개. 등장 유저 로컬 인덱스 압축 + 등수 포함.
  const kept = Math.min(rounds, REPLAY);
  const start = rounds > REPLAY ? rounds % REPLAY : 0;
  const localOf = new Map<number, number>();
  const roster: MeleeFinale['roster'] = [];
  const local = (g: number): number => {
    let l = localOf.get(g);
    if (l === undefined) {
      l = roster.length;
      localOf.set(g, l);
      const p = participants[g]!;
      roster.push({ userId: p.userId, nickname: p.nickname, cp: p.cp, rank: finalRank[g]! });
    }
    return l;
  };
  const events: MeleeFinale['events'] = [];
  for (let i = 0; i < kept; i++) {
    const s = (start + i) % REPLAY;
    events.push([local(rA[s]!), local(rT[s]!), rD[s]!, rH[s]!]);
  }

  return { ranks, championUserId: participants[champ]!.userId, finale: { roster, events } };
}
