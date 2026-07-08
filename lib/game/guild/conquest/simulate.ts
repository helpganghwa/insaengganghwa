/**
 * 점령전 결정론 시뮬 — GUILD §5.8. 순수 함수(cron에서 호출, Vitest 검증).
 *
 * 대난투 체인 전멸전(melee/simulate)을 **팀(길드) 변형**:
 *  - 각 유닛은 guildId 태그. 공격자는 **다른 길드** 유닛만 타격(같은 길드원 비공격).
 *  - 타겟 생존 → 그 타겟이 다음 공격자(반격 체인) / 타겟 패배 → 등수 기록 + 새 랜덤 공격자.
 *  - **생존 유닛이 한 길드만 남는 순간 종료** → 그 길드 승리(생존자 복수 OK).
 *  - 시작부터 한 길드뿐이면 무혈 승(무혈 점령/방어). 참가 0이면 전투 없음.
 *
 * HP = effCp × CONQUEST_HP_MULT. 데미지 = 공격자 effCp × U(MIN,MAX)(최소 1).
 *  effCp는 호출자(cron)가 역할 배수(집행관2·수비1.2·공격1.0)를 곱해 전달.
 *
 * 등수: 탈락은 역순(첫 탈락=최하위), 생존(승리 길드)은 잔여HP 내림차순으로 1..s.
 * 리플레이: 마지막 CONQUEST_REPLAY_ROUNDS 라운드를 링버퍼로 보존(O(REPLAY), N무관).
 */
import {
  CONQUEST_HP_MULT,
  CONQUEST_DMG_MIN,
  CONQUEST_DMG_MAX,
  CONQUEST_REPLAY_ROUNDS,
} from '@/lib/game/guild/balance';
import { makeRng } from '@/lib/game/melee/rng';

export type ConquestUnit = {
  userId: string;
  nickname: string;
  /** 팀 태그(같은 길드끼리 비공격). */
  guildId: string;
  guildName: string;
  /** 역할 배수까지 적용된 유효 전투력(집행관2·수비1.2·공격1.0). */
  effCp: number;
};

export type ConquestRankResult = {
  userId: string;
  /** 1 = 최상위. 승리 길드 생존자는 1..s(잔여HP순), 탈락은 s+1..n(탈락 역순). */
  finalRank: number;
  /** 본인을 탈락시킨 유닛(생존자는 null). */
  killerUserId: string | null;
  /** 승리 길드로 끝까지 생존했는지. */
  survived: boolean;
};

/** conquest_battles.finale jsonb — 클라 리플레이(길드색 클라이맥스 재생). */
export type ConquestFinale = {
  /** 등장 유닛(events의 local 인덱스가 가리킴). */
  roster: Array<{
    userId: string;
    nickname: string;
    guildId: string;
    guildName: string;
    effCp: number;
    rank: number;
  }>;
  /** [attackerLocal, targetLocal, dmg, hpAfter(≤0=탈락)] — 시간순 마지막 N라운드. */
  events: Array<[number, number, number, number]>;
};

export type ConquestSimResult = {
  /** 승리 길드(참가 0이면 null). */
  winnerGuildId: string | null;
  ranks: ConquestRankResult[];
  finale: ConquestFinale;
  totalRounds: number;
};

export function simulateConquest(units: readonly ConquestUnit[], seed: string): ConquestSimResult {
  const n = units.length;
  const emptyFinale: ConquestFinale = { roster: [], events: [] };
  if (n === 0) return { winnerGuildId: null, ranks: [], finale: emptyFinale, totalRounds: 0 };

  const rng = makeRng(seed);
  const guildOf = units.map((u) => u.guildId);
  const hp = new Float64Array(n);
  const hp0 = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const h = units[i]!.effCp * CONQUEST_HP_MULT;
    hp[i] = h;
    hp0[i] = h;
  }

  const finalRank = new Int32Array(n); // 0 = 미정(생존)
  const killer = new Int32Array(n).fill(-1);
  const alive: number[] = [];
  for (let i = 0; i < n; i++) alive.push(i);

  // 생존 길드 카운트 — size>1 동안 전투 지속.
  const guildAlive = new Map<string, number>();
  for (const g of guildOf) guildAlive.set(g, (guildAlive.get(g) ?? 0) + 1);

  // 링버퍼 — 마지막 REPLAY 라운드만.
  const REPLAY = CONQUEST_REPLAY_ROUNDS;
  const rA = new Int32Array(REPLAY);
  const rT = new Int32Array(REPLAY);
  const rD = new Int32Array(REPLAY);
  const rH = new Int32Array(REPLAY);
  let rounds = 0;

  let attacker = -1;
  let worstRank = n;

  while (guildAlive.size > 1) {
    if (attacker < 0) attacker = alive[Math.floor(rng() * alive.length)]!;
    // 타겟 = 공격자와 다른 길드(랜덤 위치에서 결정론적 전방 스캔).
    let ti = Math.floor(rng() * alive.length);
    let guard = 0;
    while (guildOf[alive[ti]!] === guildOf[attacker] && guard <= alive.length) {
      ti = (ti + 1) % alive.length;
      guard++;
    }
    const target = alive[ti]!;

    const dmg = Math.max(
      1,
      Math.round(units[attacker]!.effCp * (CONQUEST_DMG_MIN + rng() * (CONQUEST_DMG_MAX - CONQUEST_DMG_MIN))),
    );
    hp[target]! -= dmg;
    const killed = hp[target]! <= 0;
    const hpAfter = Math.round(hp[target]!);

    const slot = rounds % REPLAY;
    rA[slot] = attacker;
    rT[slot] = target;
    rD[slot] = dmg;
    rH[slot] = hpAfter;
    rounds++;

    if (killed) {
      finalRank[target] = worstRank;
      killer[target] = attacker;
      worstRank--;
      const g = guildOf[target]!;
      const c = guildAlive.get(g)! - 1;
      if (c <= 0) guildAlive.delete(g);
      else guildAlive.set(g, c);
      alive[ti] = alive[alive.length - 1]!; // swap-remove
      alive.pop();
      attacker = -1; // 체인 종료 → 새 랜덤 공격자
    } else {
      attacker = target; // 생존자가 다음 공격자
    }
  }

  // 생존자(승리 길드) — 잔여HP 내림차순으로 1..s 부여.
  const survivors = alive.slice().sort((a, b) => hp[b]! - hp[a]! || a - b);
  for (let r = 0; r < survivors.length; r++) finalRank[survivors[r]!] = r + 1;
  const winnerGuildId = survivors.length > 0 ? guildOf[survivors[0]!]! : null;

  const ranks: ConquestRankResult[] = units.map((u, i) => ({
    userId: u.userId,
    finalRank: finalRank[i]!,
    killerUserId: killer[i]! < 0 ? null : units[killer[i]!]!.userId,
    survived: hp[i]! > 0,
  }));

  // 링버퍼 → 시간순 마지막 min(rounds, REPLAY)개. 등장 유닛 로컬 인덱스 압축.
  const kept = Math.min(rounds, REPLAY);
  const start = rounds > REPLAY ? rounds % REPLAY : 0;
  const localOf = new Map<number, number>();
  const roster: ConquestFinale['roster'] = [];
  const local = (g: number): number => {
    let l = localOf.get(g);
    if (l === undefined) {
      l = roster.length;
      localOf.set(g, l);
      const u = units[g]!;
      roster.push({
        userId: u.userId,
        nickname: u.nickname,
        guildId: u.guildId,
        guildName: u.guildName,
        effCp: u.effCp,
        rank: finalRank[g]!,
      });
    }
    return l;
  };
  const events: ConquestFinale['events'] = [];
  for (let i = 0; i < kept; i++) {
    const s = (start + i) % REPLAY;
    events.push([local(rA[s]!), local(rT[s]!), rD[s]!, rH[s]!]);
  }

  return { winnerGuildId, ranks, finale: { roster, events }, totalRounds: rounds };
}
