import { describe, expect, it } from 'vitest';

import { TITLE_BY_CODE, TITLE_DEFS } from '@/lib/game/titles/defs';
import { TITLE_SECRETS } from '@/lib/game/titles/defs.server';

/**
 * 아이템 발동 칭호는 영구형(2026-09-21, 유저 건의) — 조건을 갖춘 장비를 한 번 장착해 발견하면 벗어도 대표로 쓸 수 있다.
 * 영구형이면 대표 자격(representativeEligible)·표시 재검증(resolveRepTitle)·칭호 화면의 활성 표시가 모두 '발견 = 사용 가능'이 된다.
 * 지금의 장비 상태를 말하는 세 칭호는 그대로 조건부형이다.
 */
describe('아이템 발동 칭호는 영구형', () => {
  const itemTitles = TITLE_SECRETS.filter((t) => t.cat === '아이템 발동');

  it('아이템 발동 칭호는 전부 영구형이고, 판정에 쓰는 장비 조건(req)을 갖고 있다', () => {
    expect(itemTitles.length).toBeGreaterThan(200);
    for (const t of itemTitles) {
      expect(TITLE_BY_CODE.get(t.code)?.kind, t.code).toBe('permanent');
      expect(t.req?.items.length ?? 0, t.code).toBeGreaterThan(0);
      expect(t.req!.min, t.code).toBeGreaterThan(0);
    }
  });

  it("발견 뒤 보이는 조건 글은 '장착'으로 끝난다 — '장착 중인 동안'은 이제 사실이 아니다", () => {
    for (const t of itemTitles) {
      expect(t.cond.endsWith('장착'), `${t.code}: ${t.cond}`).toBe(true);
      expect(t.cond.includes('동안'), t.code).toBe(false);
    }
  });

  it('장비 상태를 말하는 세 칭호는 조건부형 그대로다(벗으면 사라진다)', () => {
    for (const code of ['balance_master', 'full_armed', 'star_holder']) {
      expect(TITLE_BY_CODE.get(code)?.kind, code).toBe('conditional');
    }
  });

  it('조건부형에는 장비 조건(req)을 가진 칭호가 남아 있지 않다 — 표시 재검증이 장착을 다시 보지 않아도 된다', () => {
    const conditional = new Set(TITLE_DEFS.filter((d) => d.kind === 'conditional').map((d) => d.code));
    expect(TITLE_SECRETS.filter((t) => t.req && conditional.has(t.code))).toEqual([]);
  });
});
