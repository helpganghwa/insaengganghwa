/**
 * 월드보스 추천 조합(docs/WORLD-BOSS.md §3) — 순수 모듈. 가진 장비와 보유 아바타 전부를 후보로 **장비 3개 + 대표 아바타**를 함께 고른다
 * (무한의 탑 자동 장착과 같은 규칙, 10-12). 종전엔 지금 대표 아바타만 기준이라 다른 아바타로 바꾸면 더 센 조합이 있어도 제안하지 못했다.
 *
 * 값은 piecePower(공개된 약점·아바타 보너스)로, 같은 값이면 지금 장착·지금 대표를 유지한다(쓸데없이 바꾸지 않게).
 */
import { WEAK_SLOTS, type WeakSlot, piecePower } from './weak';

/** 가진 장비 한 칸 — on = 지금 그 부위에 장착 중. */
export type BestPiece = { ueid: string; slot: WeakSlot; code: string; cp: number; on: boolean };
/** 후보 아바타 — keys가 null이면 아바타 보너스가 없는 상태(기본 아바타·없음). active = 지금 대표. */
export type BestAvatar = { id: string | null; keys: Partial<Record<WeakSlot, string>> | null; active: boolean };
export type BestPlan = {
  avatar: BestAvatar;
  picks: Partial<Record<WeakSlot, BestPiece>>;
  /** 부위 전투력 합(반올림 전). */
  power: number;
  /** 지금과 다른 것이 하나라도 있는가(장착 또는 대표 아바타). */
  changed: boolean;
};

/** 아바타 스냅샷(equipment_snapshot)에서 부위별 장비 코드 — weaponKey가 없으면 아바타로 치지 않는다(loadoutsOf와 같은 판정). */
export function avatarKeysOf(snap: unknown): Partial<Record<WeakSlot, string>> | null {
  if (!snap || typeof snap !== 'object') return null;
  const o = snap as Record<string, unknown>;
  if (typeof o.weaponKey !== 'string') return null;
  const out: Partial<Record<WeakSlot, string>> = {};
  for (const slot of WEAK_SLOTS) {
    const k = o[`${slot}Key`];
    if (typeof k === 'string') out[slot] = k;
  }
  return out;
}

/**
 * 후보 아바타마다 부위별 가장 센 장비를 고르고 합이 가장 큰 조합을 돌려준다.
 * avatars가 비면 '아바타 없음' 한 가지로 계산한다. 후보에는 지금 대표(active)가 반드시 하나 들어 있어야 "바꾸지 않음"을 알 수 있다.
 */
export function pickBestLoadout(pieces: readonly BestPiece[], avatars: readonly BestAvatar[], known: ReadonlySet<string>, weakBonus: number): BestPlan {
  const cands: readonly BestAvatar[] = avatars.length ? avatars : [{ id: null, keys: null, active: true }];
  let top: BestPlan | null = null;
  for (const a of cands) {
    const picks: Partial<Record<WeakSlot, BestPiece>> = {};
    let power = 0;
    let equipChange = false;
    for (const slot of WEAK_SLOTS) {
      let best: { p: BestPiece; v: number } | null = null;
      for (const p of pieces) {
        if (p.slot !== slot) continue;
        const v = piecePower(p.cp, !!a.keys && a.keys[slot] === p.code, !!a.keys, known.has(p.code), weakBonus);
        if (!best || v > best.v || (v === best.v && p.on && !best.p.on)) best = { p, v };
      }
      if (!best) continue;
      picks[slot] = best.p;
      power += best.v;
      if (!best.p.on) equipChange = true;
    }
    const plan: BestPlan = { avatar: a, picks, power, changed: equipChange || !a.active };
    // 더 세면 교체, 같으면 지금 대표를 유지(지금 대표가 아닌 둘이 같으면 먼저 온 쪽).
    if (!top || power > top.power || (power === top.power && a.active && !top.avatar.active)) top = plan;
  }
  return top!;
}
