import { describe, expect, it } from 'vitest';

import { TITLE_BY_CODE, TITLE_DEFS } from '@/lib/game/titles/defs';
import { TITLE_SECRET_BY_CODE } from '@/lib/game/titles/defs.server';

/** 할로윈 장비 칭호 10종(2026-10-29, 소규모 업데이트 16) — 사용자가 선택 폼으로 확정한 이름·조건·연출. */
const EXPECT: [code: string, label: string, items: string[], min: number, diff: string, fx: string][] = [
  ['set_hw_smith', '모루의 계승자', ["halloween_smith_hammer", "halloween_smith_apron", "halloween_smith_scarf"], 30, '중간', 'forgeshine'],
  ['set_hw_vamp', '박쥐 날개 대공', ["halloween_vamp_parasol", "halloween_vamp_cape", "halloween_vamp_tophat"], 30, '중간', 'veilflow'],
  ['set_hw_dragon_forge', '흑룡의 대장간', ["halloween_smith_hammer", "dragonknight_scale_armor", "volcano_dragonhorn_circlet"], 50, '중간', 'blazecrimson'],
  ['set_hw_reaper_count', '혼불의 백작', ["reaper_soul_scythe", "halloween_vamp_cape", "volcano_ember_hourglass"], 50, '중간', 'abyssglow'],
  ['set_hw_witch_guest', '마녀의 귀빈', ["pumpkin_witch_staff", "pumpkin_witch_dress", "halloween_vamp_tophat"], 50, '중간', 'candle'],
  ['solo_hw_hammer', '담금질 명장', ["halloween_smith_hammer"], 70, '중간', 'steelshine'],
  ['solo_hw_parasol', '그늘의 귀공자', ["halloween_vamp_parasol"], 70, '중간', 'duskfade'],
  ['solo_hw_cape', '어린 백작', ["halloween_vamp_cape"], 70, '중간', 'roseflow'],
  ['peak300_hw_hammer', '모루 위의 전설', ["halloween_smith_hammer"], 300, '어려움', 'blaze'],
  ['peak300_hw_cape', '박쥐 군주', ["halloween_vamp_cape"], 300, '어려움', 'abyssglow'],
];

describe('할로윈 장비 칭호 10종(2026-10-29)', () => {
  it('정의·조건(req)·연출이 확정안과 같다', () => {
    for (const [code, label, items, min, diff, fx] of EXPECT) {
      const def = TITLE_BY_CODE.get(code);
      expect(def, code).toBeDefined();
      expect(def!.label).toBe(label);
      expect(Array.from(label).length).toBeLessThanOrEqual(8);
      expect(def!.cat).toBe('아이템 발동');
      expect(def!.kind).toBe('permanent');
      expect(def!.hidden).toBe(false);
      expect(def!.style.fx).toBe(fx);
      expect(def!.style.glow ?? false).toBe(diff === '어려움');
      const s = TITLE_SECRET_BY_CODE.get(code)!;
      expect(s.diff).toBe(diff);
      expect(s.req).toEqual({ items, min });
    }
  });

  it('새 이름 10개는 다른 칭호와 겹치지 않고 총수는 614', () => {
    // 전체 유일성은 지역 주인({지역} 주인 6코드)처럼 같은 라벨을 쓰는 기존 칭호가 있어 성립하지 않는다 — 새 10종만 본다.
    const count = new Map<string, number>();
    for (const d of TITLE_DEFS) count.set(d.label, (count.get(d.label) ?? 0) + 1);
    for (const [, label] of EXPECT) expect(count.get(label), label).toBe(1);
    expect(TITLE_DEFS).toHaveLength(614);
  });
});
