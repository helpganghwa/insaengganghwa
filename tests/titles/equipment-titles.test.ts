import { describe, expect, it } from 'vitest';

import { TITLE_SECRETS } from '@/lib/game/titles/defs.server';
import { equipmentTitleCodes } from '@/lib/game/titles/equipment-titles';

// 장비 칭호 즉시 확인(2026-11-06 업데이트 18 후속) — 장착 상태만으로 판단하는 규칙(judge.activeConditionals와 공용).
const combo = TITLE_SECRETS.find((t) => t.req && t.req.items.length === 3)!;
const single = TITLE_SECRETS.find((t) => t.req && t.req.items.length === 1)!;

describe('equipmentTitleCodes', () => {
  it('조합 칭호: 세 장비를 모두 최소 단계 이상으로 장착하면 발견, 하나라도 모자라면 아님', () => {
    const eq = new Map(combo.req!.items.map((k) => [k, combo.req!.min] as const));
    expect(equipmentTitleCodes(eq)).toContain(combo.code);
    const short = new Map(eq);
    short.set(combo.req!.items[0]!, combo.req!.min - 1);
    expect(equipmentTitleCodes(short)).not.toContain(combo.code);
    const missing = new Map(eq);
    missing.delete(combo.req!.items[2]!);
    expect(equipmentTitleCodes(missing)).not.toContain(combo.code);
  });
  it('단일 장비 칭호도 같은 규칙', () => {
    expect(equipmentTitleCodes(new Map([[single.req!.items[0]!, single.req!.min]]))).toContain(single.code);
  });
  it('장비 상태 칭호: 세 부위 같은 단계 50 이상 · 모두 100 이상 · 하나라도 200 이상', () => {
    const codes = equipmentTitleCodes(new Map([['a', 200], ['b', 200], ['c', 200]]));
    expect(codes).toEqual(expect.arrayContaining(['balance_master', 'full_armed', 'star_holder']));
    expect(equipmentTitleCodes(new Map([['a', 49], ['b', 49], ['c', 49]]))).not.toContain('balance_master');
    expect(equipmentTitleCodes(new Map())).toEqual([]);
  });
});
