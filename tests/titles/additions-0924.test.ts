import { describe, expect, it } from 'vitest';

import { TITLE_BY_CODE } from '@/lib/game/titles/defs';
import { TITLE_SECRET_BY_CODE } from '@/lib/game/titles/defs.server';

/** 2026-09-24 새 장비 6종(달토끼·한복) 아이템 발동 칭호 13종 — 정의(생성물) 스모크. */
const NEW: [code: string, items: number, min: number][] = [
  ['set_moon_miller', 3, 30], ['set_gilt_maiden', 3, 30], ['set_mallet_master', 3, 30], ['set_rabbit_mage', 3, 30],
  ['fullmoon_mallet_master', 1, 100], ['bok_pouch_master', 1, 100],
  ['set_moonshadow_seer', 3, 50], ['set_forest_miller', 3, 30], ['set_crimson_guard', 3, 50], ['set_frog_rabbit', 3, 30],
  ['set_bok_wanderer', 3, 30], ['set_lotus_maiden', 3, 50], ['set_cloud_rabbit', 3, 30],
];

describe('칭호 추가 0924 — 새 장비 6종 조합', () => {
  it('13종 모두 숨김·영구형 아이템 발동, 이름 8자 이내, 새 장비를 하나 이상 포함', () => {
    for (const [code, n, min] of NEW) {
      const d = TITLE_BY_CODE.get(code)!;
      expect(d, code).toBeTruthy();
      expect(d.hidden).toBe(true);
      expect(d.kind).toBe('permanent');
      expect(d.label.length).toBeLessThanOrEqual(8);
      const s = TITLE_SECRET_BY_CODE.get(code)!;
      expect(s.cat).toBe('아이템 발동');
      expect(s.req!.items).toHaveLength(n);
      expect(s.req!.min).toBe(min);
      expect(s.req!.items.some((k) => k.startsWith('chuseok_'))).toBe(true);
    }
  });
});
