import { pieceCombatPower } from '@/lib/game/balance';

/**
 * 헤더 스탯(전투력·최고·합산) 셸 값과 수동 강화 수령 델타의 선후 정리(2026-11-06 업데이트 18) — 순수 함수.
 * 수동 수령은 재렌더 없이 델타로 헤더를 맞춘다. 셸 값이 아직 없거나(null), 수령 전에 읽힌 셸 값이 늦게 도착하면
 * 델타가 사라져 낡은 값으로 끝날 수 있다. 수령마다 커밋 뒤 DB 시각(seenAtMs)을, 셸 값마다 읽은 문장의 DB 시작
 * 시각(asOfMs)을 받아 비교한다: asOf ≥ seenAt이면 셸 값에 이미 들어 있고, 아니면(또는 asOf 모름) 다시 얹고 한 번
 * 새로 받는다(새 렌더는 수령 뒤라 정확).
 */
export type HeaderStats = { combat: number; maxEnhance: number; sumEnhance: number };
export type EnhanceDelta = { fromLevel: number; toLevel: number; transcendLevel: number };
export type PendingDelta = { seenAtMs: number; d: EnhanceDelta; refreshed: boolean };

/** 셸 값과 아직 비교하지 못한 델타 상한 — 셸이 오래 안 와도 무한히 쌓이지 않게. */
export const MAX_PENDING_DELTAS = 50;

export function addEnhanceDelta(s: HeaderStats, { fromLevel, toLevel, transcendLevel }: EnhanceDelta): HeaderStats {
  const combatDelta = pieceCombatPower(toLevel, transcendLevel) - pieceCombatPower(fromLevel, transcendLevel);
  return {
    combat: s.combat + combatDelta,
    maxEnhance: Math.max(s.maxEnhance, toLevel),
    sumEnhance: s.sumEnhance + (toLevel - fromLevel),
  };
}

/**
 * 셸 값 도착 — 남길 대기 델타, 보여 줄 값, 새로 받기 필요 여부.
 * 반환된 pending 항목의 refreshed는 이번에 새로 받기를 요청했으면 true로 바뀐 사본이다.
 */
export function reconcileHeaderBase(
  next: HeaderStats | null,
  asOfMs: number | null,
  pending: readonly PendingDelta[],
): { stats: HeaderStats | null; pending: PendingDelta[]; refresh: boolean } {
  const remain = asOfMs != null ? pending.filter((p) => p.seenAtMs > asOfMs) : [...pending];
  if (!next || remain.length === 0) return { stats: next, pending: remain, refresh: false };
  const stats = remain.reduce((s, p) => addEnhanceDelta(s, p.d), next);
  const refresh = remain.some((p) => !p.refreshed);
  return { stats, pending: refresh ? remain.map((p) => ({ ...p, refreshed: true })) : remain, refresh };
}

/** 하단 네비 강화 완료 점 덮어쓰기(수령 응답 값 + 그 값을 읽은 DB 시각). */
export type EnhanceDotOverride = { value: boolean; seenAtMs: number | null };

/**
 * 새 셸 렌더가 왔을 때 덮어쓰기를 풀지(2026-11-06 업데이트 18) — 셸 점이 덮어쓴 값보다 나중에 읽혔을 때만 푼다.
 * 셸 asOf를 모르면(실패 기본값) 유지, 덮어쓴 값의 시각을 모르면(복구 경로가 refresh를 동반) 푼다.
 */
export function releaseDotOverride(
  o: EnhanceDotOverride | null,
  shellAsOfMs: number | null,
): EnhanceDotOverride | null {
  if (!o) return o;
  if (shellAsOfMs == null) return o;
  if (o.seenAtMs != null && shellAsOfMs < o.seenAtMs) return o;
  return null;
}
