import { describe, expect, it } from 'vitest';

import { addEnhanceDelta, reconcileHeaderBase, releaseDotOverride, type PendingDelta } from '@/lib/client/header-stats-reconcile';

// 헤더 스탯 셸 값 ↔ 수동 수령 델타 선후 정리(2026-11-06 업데이트 18).
const base = { combat: 1000, maxEnhance: 10, sumEnhance: 20 };
const d = { fromLevel: 5, toLevel: 6, transcendLevel: 0 };
const pend = (seenAtMs: number, refreshed = false): PendingDelta => ({ seenAtMs, d, refreshed });

describe('reconcileHeaderBase', () => {
  it('셸 문장이 수령 직후 애매한 구간(2초 안)에 읽혔으면 델타를 얹지 않고(두 번 더하기 방지) 한 번 새로 받는다', () => {
    const r = reconcileHeaderBase(base, 4000, [pend(5000)]);
    expect(r.stats).toEqual(base);
    expect(r.refresh).toBe(true);
    expect(r.pending).toEqual([pend(5000, true)]);
  });

  it('대기 델타가 없으면 셸 값 그대로, 새로 받기 없음', () => {
    const r = reconcileHeaderBase(base, 100, []);
    expect(r).toEqual({ stats: base, pending: [], refresh: false });
  });

  it('셸 값이 수령 커밋 뒤에 읽혔으면(asOf ≥ seenAt) 델타는 이미 들어 있어 버린다', () => {
    const r = reconcileHeaderBase(base, 200, [pend(150), pend(200)]);
    expect(r.stats).toEqual(base);
    expect(r.pending).toEqual([]);
    expect(r.refresh).toBe(false);
  });

  it('셸 값이 수령 전에 읽혔으면 델타를 다시 얹고 한 번 새로 받는다', () => {
    const r = reconcileHeaderBase(base, 100, [pend(5000)]);
    expect(r.stats).toEqual(addEnhanceDelta(base, d));
    expect(r.stats?.sumEnhance).toBe(21);
    expect(r.refresh).toBe(true);
    expect(r.pending).toEqual([pend(5000, true)]);
  });

  it('asOf를 모르면(null) 남겨 두고 얹은 뒤 새로 받는다', () => {
    const r = reconcileHeaderBase(base, null, [pend(150)]);
    expect(r.stats?.sumEnhance).toBe(21);
    expect(r.refresh).toBe(true);
  });

  it('이미 새로 받기를 요청한 델타로는 다시 요청하지 않는다(무한 refresh 방지)', () => {
    const r = reconcileHeaderBase(base, 100, [pend(5000, true)]);
    expect(r.stats?.sumEnhance).toBe(21);
    expect(r.refresh).toBe(false);
  });

  it('셸 값이 null이면 null 유지, 대기 델타는 다음 셸 값까지 남는다', () => {
    const r = reconcileHeaderBase(null, null, [pend(150)]);
    expect(r.stats).toBeNull();
    expect(r.pending).toHaveLength(1);
    expect(r.refresh).toBe(false);
  });

  it('셸 값이 처음 도착할 때(수령 시점엔 null이었음) 수령 전 값이면 얹고, 이후 최신 렌더가 오면 지운다', () => {
    const first = reconcileHeaderBase(base, 100, [pend(5000)]);
    expect(first.stats?.maxEnhance).toBe(10);
    expect(first.stats?.sumEnhance).toBe(21);
    const fresh = { combat: 1100, maxEnhance: 10, sumEnhance: 21 };
    const second = reconcileHeaderBase(fresh, 6000, first.pending);
    expect(second.stats).toEqual(fresh);
    expect(second.pending).toEqual([]);
  });
});

describe('releaseDotOverride', () => {
  const o = { value: false, seenAtMs: 200 };
  it('덮어쓴 값보다 나중에 읽힌 셸이면 푼다', () => {
    expect(releaseDotOverride(o, 250)).toBeNull();
    expect(releaseDotOverride(o, 200)).toBeNull();
  });
  it('수령 전에 읽힌 늦은 셸 렌더면 유지(틀린 점으로 돌아가지 않음)', () => {
    expect(releaseDotOverride(o, 150)).toBe(o);
  });
  it('셸 시각을 모르면(실패 기본값) 유지', () => {
    expect(releaseDotOverride(o, null)).toBe(o);
  });
  it('덮어쓴 값의 시각을 모르면 새 셸에서 푼다', () => {
    expect(releaseDotOverride({ value: true, seenAtMs: null }, 100)).toBeNull();
  });
  it('덮어쓰기가 없으면 그대로', () => {
    expect(releaseDotOverride(null, 100)).toBeNull();
  });
});
