import { describe, expect, it } from 'vitest';

import { normalizePresetName, planPreset, presetDisplayName, type PresetLanes, type RunningLanes } from '@/lib/game/enhance/preset-plan';

/** 프리셋 적용 계획(순수) — 10-21 결정: keep 그대로 · empty 취소 · item 같은 장비면 그대로, 아니면 취소+등록 · 다른 칸의 같은 장비는 옮겨 온다. */
describe('planPreset', () => {
  const running: RunningLanes = {
    'weapon:1': { equipmentId: '10', jobId: '100' },
    'weapon:2': { equipmentId: '11', jobId: '101' },
    'armor:1': { equipmentId: '20', jobId: '200' },
  };

  it('빈 프리셋(전부 keep)은 바뀌는 칸 0', () => {
    const p = planPreset({}, running);
    expect(p.changed).toBe(0);
    expect(p.lanes.every((l) => l.action === 'keep')).toBe(true);
    expect(p.extraCancels).toEqual([]);
  });

  it('같은 장비가 이미 그 칸이면 keep, 다른 장비면 swap, 빈 칸이면 queue, empty면 clear', () => {
    const lanes: PresetLanes = {
      'weapon:1': { kind: 'item', equipmentId: '10' },
      'weapon:2': { kind: 'item', equipmentId: '12' },
      'armor:1': { kind: 'empty' },
      'armor:2': { kind: 'item', equipmentId: '21' },
      'accessory:1': { kind: 'empty' },
    };
    const p = planPreset(lanes, running);
    const by = Object.fromEntries(p.lanes.map((l) => [l.key, l]));
    expect(by['weapon:1']).toEqual({ key: 'weapon:1', action: 'keep' });
    expect(by['weapon:2']).toEqual({ key: 'weapon:2', action: 'swap', cancelJobId: '101', equipmentId: '12' });
    expect(by['armor:1']).toEqual({ key: 'armor:1', action: 'clear', cancelJobId: '200' });
    expect(by['armor:2']).toEqual({ key: 'armor:2', action: 'queue', equipmentId: '21' });
    expect(by['accessory:1']).toEqual({ key: 'accessory:1', action: 'keep' }); // 지금도 비어 있음
    expect(p.changed).toBe(3);
  });

  it('프리셋 장비가 다른 칸에서 진행 중이면 그 잡을 먼저 취소한다(extraCancels)', () => {
    const lanes: PresetLanes = { 'weapon:2': { kind: 'item', equipmentId: '10' } }; // 10은 지금 weapon:1
    const p = planPreset(lanes, running);
    expect(p.lanes.find((l) => l.key === 'weapon:2')).toEqual({ key: 'weapon:2', action: 'swap', cancelJobId: '101', equipmentId: '10' });
    expect(p.extraCancels).toEqual([{ key: 'weapon:1', jobId: '100' }]);
    expect(p.changed).toBe(2);
  });

  it('두 칸을 맞바꾸면 extraCancels 없이 swap 둘', () => {
    const lanes: PresetLanes = { 'weapon:1': { kind: 'item', equipmentId: '11' }, 'weapon:2': { kind: 'item', equipmentId: '10' } };
    const p = planPreset(lanes, running);
    expect(p.lanes.filter((l) => l.action === 'swap')).toHaveLength(2);
    expect(p.extraCancels).toEqual([]);
    expect(p.changed).toBe(2);
  });

  it('같은 장비를 두 칸에 넣은 프리셋은 한 칸만 keep(원래 칸)이고 다른 칸은 swap — 적용 쪽이 ALREADY_ENHANCING으로 막는다', () => {
    const lanes: PresetLanes = { 'weapon:1': { kind: 'item', equipmentId: '10' }, 'weapon:2': { kind: 'item', equipmentId: '10' } };
    const p = planPreset(lanes, running);
    expect(p.lanes.find((l) => l.key === 'weapon:1')?.action).toBe('keep');
    expect(p.lanes.find((l) => l.key === 'weapon:2')?.action).toBe('swap');
  });
});

describe('이름', () => {
  it('normalizePresetName — 앞뒤 공백 제거·8자(코드포인트)까지', () => {
    expect(normalizePresetName('  밤 세트  ')).toBe('밤 세트');
    expect(normalizePresetName('가나다라마바사아자차')).toBe('가나다라마바사아');
    expect(normalizePresetName('😀😀😀😀😀😀😀😀😀')).toBe('😀😀😀😀😀😀😀😀');
  });
  it('presetDisplayName — 빈 이름은 프리셋 N', () => {
    expect(presetDisplayName({ presetNo: 2, name: '' })).toBe('프리셋 2');
    expect(presetDisplayName({ presetNo: 2, name: ' 낮 ' })).toBe('낮');
  });
});
