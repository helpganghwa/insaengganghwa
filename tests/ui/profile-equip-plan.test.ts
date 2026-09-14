import { describe, expect, it } from 'vitest';

import { chipState, optimisticPatch, setPlan, type SnapshotChip } from '@/app/(game)/me/profiles/equip-plan';

/** 아바타 관리 화면 장비 칩 상태·세트 계획(2026-09-14). */
const W: SnapshotChip = { key: 'sword_a', slot: 'weapon', name: '창천검', userEquipmentId: '11' };
const A: SnapshotChip = { key: 'robe_b', slot: 'armor', name: '아침빛 예복', userEquipmentId: '12' };
const C: SnapshotChip = { key: 'crown_c', slot: 'accessory', name: '설화의 관', userEquipmentId: null };

describe('chipState', () => {
  it('그 부위에 지금 장착 중인 키면 on', () => {
    expect(chipState(A, { armor: { key: 'robe_b', name: '아침빛 예복' } })).toBe('on');
  });
  it('보유 중이지만 다른 장비가 장착돼 있거나 비어 있으면 can', () => {
    expect(chipState(W, { weapon: { key: 'staff_x', name: '유성의 지팡이' } })).toBe('can');
    expect(chipState(W, {})).toBe('can');
  });
  it('보유 행이 없으면 no', () => {
    expect(chipState(C, {})).toBe('no');
    expect(chipState(C, { accessory: { key: 'ring_y', name: '다른 반지' } })).toBe('no');
  });
});

describe('setPlan', () => {
  it('can만 장착, on은 이미, no는 건너뜀', () => {
    const plan = setPlan([W, A, C], { armor: { key: 'robe_b', name: '아침빛 예복' } });
    expect(plan.equip.map((c) => c.key)).toEqual(['sword_a']);
    expect(plan.already.map((c) => c.key)).toEqual(['robe_b']);
    expect(plan.skipped.map((c) => c.key)).toEqual(['crown_c']);
  });
  it('전부 장착 중이면 equip이 비고, 부위 순서를 유지한다', () => {
    const now = { weapon: { key: 'sword_a', name: '' }, armor: { key: 'robe_b', name: '' } };
    expect(setPlan([W, A], now).equip).toEqual([]);
    expect(setPlan([A, W], {}).equip.map((c) => c.slot)).toEqual(['armor', 'weapon']);
  });
});

describe('optimisticPatch', () => {
  it('장착할 칩을 부위별 현재 장착으로 바꾼다(다른 부위는 건드리지 않음)', () => {
    expect(optimisticPatch([W])).toEqual({ weapon: { key: 'sword_a', name: '창천검' } });
    expect(Object.keys(optimisticPatch([W, A]))).toEqual(['weapon', 'armor']);
  });
});
