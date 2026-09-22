import { describe, expect, it } from 'vitest';

import { TITLE_BY_CODE, TITLE_DEFS } from '@/lib/game/titles/defs';
import { TITLE_SECRET_BY_CODE } from '@/lib/game/titles/defs.server';
import { PENDING_CODES } from '@/lib/game/titles/pending';

/**
 * 2026 한가위 강화 대회 순위 칭호 6종 — 달토끼 장비(신월·반월·만월)와 한복 장비(매화·작약·모란).
 * 결산 때 어드민이 직접 넣는 수동 지급 칭호. 목록에 이름은 보이되(hidden:false) 조건은 발견 전까지
 * 내려가지 않는 기존 원칙을 따르고, 효과는 세트마다 3등 맥동 → 2등 흐름 → 1등 흐름+파티클로 세진다.
 */
describe('한가위 2026 순위 칭호', () => {
  const sets = {
    moon: { codes: ['chuseok26_moon3', 'chuseok26_moon2', 'chuseok26_moon1'], labels: ['신월', '반월', '만월'], fx: ['newmoon', 'halfmoon', 'fullmoon'], pt: 'moondust' },
    flower: { codes: ['chuseok26_flower3', 'chuseok26_flower2', 'chuseok26_flower1'], labels: ['매화', '작약', '모란'], fx: ['plum', 'peony', 'moran'], pt: 'petal' },
  } as const;

  it('6종이 영구·공개·한정으로 정의되고 목록에서 빠지지 않는다', () => {
    for (const set of Object.values(sets)) {
      for (const code of set.codes) {
        const d = TITLE_BY_CODE.get(code);
        expect(d, code).toBeDefined();
        expect(d!.kind).toBe('permanent');
        expect(d!.hidden).toBe(false);
        expect(d!.cat).toBe('한가위');
        expect(TITLE_SECRET_BY_CODE.get(code)?.diff).toBe('한정');
        expect(PENDING_CODES.has(code)).toBe(false);
      }
      expect(set.codes.map((c) => TITLE_BY_CODE.get(c)!.label)).toEqual([...set.labels]);
    }
  });

  it('세트마다 효과에 위계가 있다 — 1등만 파티클', () => {
    for (const set of Object.values(sets)) {
      const [r3, r2, r1] = set.codes.map((c) => TITLE_BY_CODE.get(c)!.style);
      expect([r3.fx, r2.fx, r1.fx]).toEqual([...set.fx]);
      expect(r3.pt).toBeUndefined();
      expect(r2.pt).toBeUndefined();
      expect(r1.pt).toBe(set.pt);
    }
  });

  it('공개 정의에는 조건이 실리지 않는다', () => {
    for (const d of TITLE_DEFS.filter((t) => t.code.startsWith('chuseok26_'))) {
      expect(JSON.stringify(d)).not.toContain('대회');
    }
  });
});
