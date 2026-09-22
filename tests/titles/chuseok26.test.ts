import { describe, expect, it } from 'vitest';

import { TITLE_BY_CODE, TITLE_DEFS } from '@/lib/game/titles/defs';
import { TITLE_SECRET_BY_CODE } from '@/lib/game/titles/defs.server';
import { PENDING_CODES } from '@/lib/game/titles/pending';

/**
 * 2026 한가위 강화 대회 순위 칭호 6종 — 달토끼 장비(신월·반월·만월)와 한복 장비(매화·작약·모란).
 * 결산 때 어드민이 직접 넣는 수동 지급 칭호. 목록에 이름은 보이되(hidden:false) 조건은 발견 전까지
 * 내려가지 않는 기존 원칙을 따른다. 달 세트는 달이 밝아질 때 한글↔한자가 바뀌는 두 겹 라벨, 꽃 세트는 꽃잎이 흩날리는 파티클.
 */
describe('한가위 2026 순위 칭호', () => {
  const sets = {
    moon: { codes: ['chuseok26_moon3', 'chuseok26_moon2', 'chuseok26_moon1'], labels: ['신월', '반월', '만월'], fx: ['newmoon', 'halfmoon', 'fullmoon'], alt: ['新月', '半月', '滿月'] },
    flower: { codes: ['chuseok26_flower3', 'chuseok26_flower2', 'chuseok26_flower1'], labels: ['매화', '작약', '모란'], fx: ['plum', 'peony', 'moran'] },
  } as const;

  it('6종이 영구·공개·한정으로 정의되고 목록에서 빠지지 않는다', () => {
    for (const set of Object.values(sets)) {
      for (const code of set.codes) {
        const d = TITLE_BY_CODE.get(code);
        expect(d, code).toBeDefined();
        expect(d!.kind).toBe('permanent');
        expect(d!.hidden).toBe(false);
        expect(d!.cat).toBe('추석');
        expect(TITLE_SECRET_BY_CODE.get(code)?.diff).toBe('한정');
        expect(PENDING_CODES.has(code)).toBe(false);
      }
      expect(set.codes.map((c) => TITLE_BY_CODE.get(c)!.label)).toEqual([...set.labels]);
    }
  });

  it('달 세트는 두 겹 라벨(한자)이고 파티클이 없다 — 달(.orb)이 빛을 맡는다', () => {
    const styles = sets.moon.codes.map((c) => TITLE_BY_CODE.get(c)!.style);
    expect(styles.map((s) => s.fx)).toEqual([...sets.moon.fx]);
    expect(styles.map((s) => s.alt)).toEqual([...sets.moon.alt]);
    for (const s of styles) expect(s.pt).toBeUndefined();
  });

  it('꽃 세트는 한자 없이 꽃 아이콘(orb) + 꽃잎 파티클이다', () => {
    const styles = sets.flower.codes.map((c) => TITLE_BY_CODE.get(c)!.style);
    expect(styles.map((s) => s.fx)).toEqual([...sets.flower.fx]);
    for (const s of styles) {
      expect(s.alt).toBeUndefined();
      expect(s.orb).toBe(true);
      expect(s.pt).toBe('petal');
    }
  });

  it('공개 정의에는 조건이 실리지 않는다', () => {
    for (const d of TITLE_DEFS.filter((t) => t.code.startsWith('chuseok26_'))) {
      expect(JSON.stringify(d)).not.toContain('대회');
    }
  });
});
