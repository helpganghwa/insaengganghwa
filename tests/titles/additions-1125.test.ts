import { describe, expect, it } from 'vitest';

import { equipmentTitleCodes } from '@/lib/game/titles/equipment-titles';
import { TITLE_BY_CODE } from '@/lib/game/titles/defs';
import { TITLE_SECRET_BY_CODE } from '@/lib/game/titles/defs.server';
import { RULES } from '@/lib/game/titles/judge';

// 업데이트 21 칭호 11종(2026-11-25, 검토 폼 채택·이펙트 선택) — 장비 7 + 일반 4.
const EQUIP: [code: string, item: string, min: number, fx: string][] = [
  ['solo_hw_apron', 'halloween_smith_apron', 70, 'cinderflow'],
  ['solo_hw_scarf', 'halloween_smith_scarf', 70, 'ashstatic'],
  ['solo_hw_tophat', 'halloween_vamp_tophat', 70, 'blushbreath'],
  ['azure_sky_blade', 'kingdom_ribbon_rapier', 100, 'glassflow'],
  ['myriad_books', 'round_gold_glasses', 100, 'linenflow'],
  ['frog_lord', 'marsh_frog_hood', 200, 'slimeflow'],
  ['cloud_stroll', 'angel_cherub_armor', 100, 'starlight'],
];

describe('업데이트 21 칭호 11종', () => {
  it('장비 칭호 7종은 그 장비 하나·단계로만 판정되고, 고른 이펙트(파티클 없음)를 쓴다', () => {
    for (const [code, item, min, fx] of EQUIP) {
      expect(TITLE_SECRET_BY_CODE.get(code)?.req).toEqual({ items: [item], min });
      expect(TITLE_BY_CODE.get(code)?.style.fx).toBe(fx);
      expect(TITLE_BY_CODE.get(code)?.style.pt).toBeUndefined();
      expect(equipmentTitleCodes(new Map([[item, min]]))).toContain(code);
      expect(equipmentTitleCodes(new Map([[item, min - 1]]))).not.toContain(code);
    }
  });

  it('이름은 8자 이하이고 공개 칭호다', () => {
    for (const code of [...EQUIP.map((e) => e[0]), 'raid_all_50', 'exp_six_slots', 'medal_collector_100', 'wbq_30']) {
      const d = TITLE_BY_CODE.get(code)!;
      expect([...d.label].length).toBeLessThanOrEqual(8);
      expect(d.hidden).toBe(false);
    }
  });

  it('일반 칭호 경계값 — 한 번에 50회 · 파견 6칸 · 여왕 30회', () => {
    const p = RULES as unknown as Record<string, (m: Record<string, number>) => boolean>;
    expect(p.raid_all_50!({ r_all_uses: 49 })).toBe(false);
    expect(p.raid_all_50!({ r_all_uses: 50 })).toBe(true);
    expect(p.exp_six_slots!({ exp_slots: 5 })).toBe(false);
    expect(p.exp_six_slots!({ exp_slots: 6 })).toBe(true);
    expect(p.wbq_30!({ wbq_runs: 29 })).toBe(false);
    expect(p.wbq_30!({ wbq_runs: 30 })).toBe(true);
  });
});
