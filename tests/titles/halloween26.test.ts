import { describe, expect, it } from 'vitest';

import { CANDY_LADDER_TITLES, HALLOWEEN_RANK_TITLES } from '@/lib/game/halloween/config';
import { TITLE_BY_CODE, TITLE_DEFS } from '@/lib/game/titles/defs';
import { TITLE_SECRET_BY_CODE } from '@/lib/game/titles/defs.server';
import { EVENT_HOOK_CODES, PENDING_CODES } from '@/lib/game/titles/pending';

/**
 * 2026 할로윈 칭호 6종 — 사탕 도달(4만·10만·15만) 3 + 강화 대회 순위(6종 공통) 3.
 * 이름·이펙트는 임시(2026-10-25) — 확정되면 이름 단언을 더한다. 지급 경로는 이벤트 훅(수령·정산).
 */
describe('할로윈 2026 칭호', () => {
  const codes = [...CANDY_LADDER_TITLES, ...HALLOWEEN_RANK_TITLES];

  it('6종이 영구·공개·한정으로 정의되고, 판정 밖 이벤트 훅 칭호로 등록돼 있다', () => {
    expect(codes).toHaveLength(6);
    for (const code of codes) {
      const d = TITLE_BY_CODE.get(code);
      expect(d, code).toBeDefined();
      expect(d!.kind).toBe('permanent');
      expect(d!.hidden).toBe(false);
      expect(d!.cat).toBe('할로윈');
      expect(TITLE_SECRET_BY_CODE.get(code)?.diff).toBe('한정');
      expect(PENDING_CODES.has(code)).toBe(false);
      expect(EVENT_HOOK_CODES.has(code)).toBe(true);
    }
  });

  it('공개 정의에는 조건이 실리지 않는다', () => {
    for (const d of TITLE_DEFS.filter((t) => t.code.startsWith('halloween26_'))) {
      expect(JSON.stringify(d)).not.toMatch(/대회|사탕 \d/);
    }
  });
});
