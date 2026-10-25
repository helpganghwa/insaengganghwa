import { describe, expect, it } from 'vitest';

import { TITLE_BY_CODE, TITLE_DEFS } from '@/lib/game/titles/defs';

/** 아바타 보관함 300칸 칭호(2026-10-16) — 하나만, 공개, 전용 이펙트. 판정(judge 'avatar_slot_300')은 한도 기준(100 + 늘린 칸 ≥ 300). */
describe('환영술사(avatar_slot_300)', () => {
  it('공개 · 영구 · 아바타 카테고리 · mirage 이펙트', () => {
    const t = TITLE_BY_CODE.get('avatar_slot_300');
    expect(t).toBeTruthy();
    expect(t).toMatchObject({ label: '환영술사', kind: 'permanent', hidden: false, cat: '아바타' });
    expect(t!.style.fx).toBe('mirage');
  });

  it('200칸 칭호는 없고(사용자 결정), 이름·코드는 유일하다', () => {
    expect(TITLE_DEFS.filter((t) => t.code.startsWith('avatar_slot_')).map((t) => t.code)).toEqual(['avatar_slot_300']);
    expect(TITLE_DEFS.filter((t) => t.label === '환영술사')).toHaveLength(1);
    expect(TITLE_DEFS.length).toBe(605);
  });
});
