import { describe, expect, it } from 'vitest';

import { TITLE_BY_CODE, TITLE_DEFS } from '@/lib/game/titles/defs';
import { TITLE_SECRET_BY_CODE } from '@/lib/game/titles/defs.server';
import { PENDING_CODES } from '@/lib/game/titles/pending';

/**
 * 2026 한가위 강화 대회 순위 칭호 3종 — 결산 때 어드민이 직접 넣는 수동 지급 칭호.
 * 목록에 이름은 보이되(hidden:false) 조건은 발견 전까지 내려가지 않는 기존 원칙을 따르고,
 * 효과는 3등 → 1등으로 갈수록 세진다(맥동 → 흐름 → 흐름+파티클).
 */
describe('한가위 2026 순위 칭호', () => {
  const codes = ['chuseok26_rank3', 'chuseok26_rank2', 'chuseok26_rank1'] as const;

  it('3종이 영구·공개·한정으로 정의되고 목록에서 빠지지 않는다', () => {
    for (const code of codes) {
      const d = TITLE_BY_CODE.get(code);
      expect(d, code).toBeDefined();
      expect(d!.kind).toBe('permanent');
      expect(d!.hidden).toBe(false);
      expect(d!.cat).toBe('한가위');
      expect(TITLE_SECRET_BY_CODE.get(code)?.diff).toBe('한정');
      expect(PENDING_CODES.has(code)).toBe(false);
    }
    expect(codes.map((c) => TITLE_BY_CODE.get(c)!.label)).toEqual(['신월', '반월', '만월']);
  });

  it('효과에 위계가 있다 — 1등만 파티클, 2등은 흐름, 3등은 맥동', () => {
    const [r3, r2, r1] = codes.map((c) => TITLE_BY_CODE.get(c)!.style);
    expect(r3.fx).toBe('moonlight');
    expect(r3.pt).toBeUndefined();
    expect(r2.fx).toBe('lunarflow');
    expect(r2.pt).toBeUndefined();
    expect(r1.fx).toBe('goldflow');
    expect(r1.pt).toBe('stardust');
  });

  it('공개 정의에는 조건이 실리지 않는다', () => {
    for (const d of TITLE_DEFS.filter((t) => t.code.startsWith('chuseok26_'))) {
      expect(JSON.stringify(d)).not.toContain('대회');
    }
  });
});
