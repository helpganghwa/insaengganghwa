import { describe, expect, it } from 'vitest';

import { TITLE_BY_CODE } from '@/lib/game/titles/defs';
import { TITLE_SECRETS } from '@/lib/game/titles/defs.server';
import { EVENT_HOOK_CODES } from '@/lib/game/titles/pending';
import { enhanceMomentTitles, isKstMidnightSecond, soloFeatTitle } from '@/lib/game/titles/moment-rules';

/** 소규모 업데이트 17 숨김 칭호 8종(2026-11-04). */
const CODES = ['chron_10', 'chron_head', 'chron_20', 'cq_solo_take', 'cq_solo_hold', 'enh_needle', 'enh_404', 'enh_midnight'];
const HOOKED = ['enh_needle', 'enh_404', 'enh_midnight', 'cq_solo_take', 'cq_solo_hold'];
const kst = (iso: string) => Date.parse(iso);

describe('업데이트 17 숨김 칭호', () => {
  it('8종 모두 영구·숨김이고 조건은 서버 정의에만 있다', () => {
    for (const c of CODES) {
      const d = TITLE_BY_CODE.get(c)!;
      expect(d, c).toBeTruthy();
      expect(d.kind).toBe('permanent');
      expect(d.hidden).toBe(true);
      expect(TITLE_SECRETS.find((s) => s.code === c)?.cond).toBeTruthy();
    }
    expect(TITLE_BY_CODE.get('chron_20')!.style.fxOnlyFx).toEqual(['chronheroa', 'chronherob']);
  });

  it('강화·점령전 5종은 이벤트 훅 지급으로 등록돼 있다', () => {
    for (const c of HOOKED) expect(EVENT_HOOK_CODES.has(c), c).toBe(true);
  });

  it('바늘구멍 — 0.5% 이하 성공·대성공만', () => {
    const base = { fromLevel: 10, toLevel: 11, resolvedAt: kst('2026-11-04T15:00:00+09:00') };
    expect(enhanceMomentTitles({ ...base, outcome: 'success', effectiveRateBp: 50 })).toEqual(['enh_needle']);
    expect(enhanceMomentTitles({ ...base, outcome: 'mega', effectiveRateBp: 12 })).toEqual(['enh_needle']);
    expect(enhanceMomentTitles({ ...base, outcome: 'success', effectiveRateBp: 51 })).toEqual([]);
    expect(enhanceMomentTitles({ ...base, outcome: 'hold', effectiveRateBp: 10 })).toEqual([]);
  });

  it('찾을 수 없음 — 정확히 +404가 된 순간(올라서든 내려서든), 머문 경우 제외', () => {
    const at = kst('2026-11-04T15:00:00+09:00');
    expect(enhanceMomentTitles({ outcome: 'success', fromLevel: 403, toLevel: 404, effectiveRateBp: 9000, resolvedAt: at })).toEqual(['enh_404']);
    expect(enhanceMomentTitles({ outcome: 'down', fromLevel: 405, toLevel: 404, effectiveRateBp: 9000, resolvedAt: at })).toEqual(['enh_404']);
    expect(enhanceMomentTitles({ outcome: 'hold', fromLevel: 404, toLevel: 404, effectiveRateBp: 9000, resolvedAt: at })).toEqual([]);
  });

  it('신데렐라 — KST 00:00:00.000~.999만', () => {
    expect(isKstMidnightSecond(kst('2026-11-05T00:00:00.000+09:00'))).toBe(true);
    expect(isKstMidnightSecond(kst('2026-11-05T00:00:00.999+09:00'))).toBe(true);
    expect(isKstMidnightSecond(kst('2026-11-05T00:00:01.000+09:00'))).toBe(false);
    expect(isKstMidnightSecond(kst('2026-11-04T23:59:59.999+09:00'))).toBe(false);
    expect(isKstMidnightSecond(new Date('2026-11-04T15:00:00.500Z'))).toBe(true); // UTC 15시 = KST 자정
  });

  it('단신 활약 → 칭호', () => {
    expect(soloFeatTitle('take')).toBe('cq_solo_take');
    expect(soloFeatTitle('hold')).toBe('cq_solo_hold');
  });
});
