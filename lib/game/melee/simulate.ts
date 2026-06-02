/**
 * 대난투 결정론 시뮬 — MELEE §4. 순수 함수(서버 cron에서 호출, Vitest 검증).
 *
 * 체인 난투: 매 라운드 공격자 1명이 타겟 1명을 1회 타격(누적 차감, 항상 명중).
 *  - 타겟 생존 → 그 타겟이 다음 공격자(반격 체인)
 *  - 타겟 패배 → 등수 기록(첫 탈락 = N위, 역순) + killer 기록 → 새 랜덤 공격자
 *  - 마지막 생존자 = 1위(챔피언)
 * HP = 전투력 × MELEE_HP_MULT. 데미지 = 공격자 전투력 × U(MIN,MAX)(최소 1).
 *
 * 리플레이는 finale(생존자 ≤ MELEE_FINALE_SIZE 구간 = 상위 100위 전투)만 보존 — N무관 상수 크기.
 */
import {
  MELEE_HP_MULT,
  MELEE_DMG_MIN,
  MELEE_DMG_MAX,
  MELEE_FINALE_SIZE,
} from '@/lib/game/balance';
import type { MeleeFinale } from '@/lib/db/schema/melee';

import { makeRng } from './rng';

export type MeleeParticipantInput = { userId: string; nickname: string; cp: number };
export type MeleeRankResult = { userId: string; finalRank: number; killerUserId: string | null };
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
      ranks: [{ userId: p.userId, finalRank: 1, killerUserId: null }],
      championUserId: p.userId,
      finale: { roster: [{ userId: p.userId, nickname: p.nickname, cp: p.cp }], events: [] },
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

  const events: MeleeFinale['events'] = [];
  let attacker = -1; // 참가자 인덱스. -1 = 새로 뽑아야 함(체인 종료/시작)
  let worstRank = n;

  while (alive.length > 1) {
    if (attacker < 0) attacker = alive[Math.floor(rng() * alive.length)]!;
    // 타겟 = 생존자 중 공격자 제외 (alive 위치 ti로 뽑아 O(1) 제거)
    let ti = Math.floor(rng() * alive.length);
    if (alive[ti] === attacker) ti = (ti + 1) % alive.length;
    const target = alive[ti]!;

    const dmg = Math.max(
      1,
      Math.round(cp[attacker]! * (MELEE_DMG_MIN + rng() * (MELEE_DMG_MAX - MELEE_DMG_MIN))),
    );
    hp[target]! -= dmg;
    const killed = hp[target]! <= 0;

    if (alive.length <= MELEE_FINALE_SIZE) {
      events.push({
        a: participants[attacker]!.userId,
        t: participants[target]!.userId,
        d: dmg,
        k: killed,
      });
    }

    if (killed) {
      finalRank[target] = worstRank;
      killer[target] = attacker;
      worstRank--;
      alive[ti] = alive[alive.length - 1]!; // swap-remove
      alive.pop();
      attacker = -1; // 체인 종료 → 다음은 새 랜덤 공격자
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
  }));

  // 피날레 로스터 = 상위 MELEE_FINALE_SIZE 등(이벤트에 등장하는 전원). 등수 오름차순.
  const roster = participants
    .map((p, i) => ({ p, r: finalRank[i]! }))
    .filter((x) => x.r <= MELEE_FINALE_SIZE)
    .sort((a, b) => a.r - b.r)
    .map((x) => ({ userId: x.p.userId, nickname: x.p.nickname, cp: x.p.cp }));

  return { ranks, championUserId: participants[champ]!.userId, finale: { roster, events } };
}
