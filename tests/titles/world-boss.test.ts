import { describe, expect, it } from 'vitest';

import { TITLE_BY_CODE } from '@/lib/game/titles/defs';
import { TITLE_SECRET_BY_CODE } from '@/lib/game/titles/defs.server';
import { GUILD_COLLECTIVE_CODES } from '@/lib/game/titles/guild-facts';

/** 월드보스 칭호 11종(2026-10-11 사용자 제출·효과 고르기 확정) — 정의(생성물) 스모크. */
const WB: [code: string, label: string, fx: string, pt: string | null, kind: 'permanent' | 'conditional'][] = [
  ['wb_first', '첫 토벌', 'rimlight', null, 'permanent'],
  ['wb_50', '산전수전', 'pyrevert', null, 'permanent'],
  ['wb_lead_10', '재의 재앙', 'pyreglow', 'ember', 'permanent'],
  ['wb_reveal', '약점 꿰뚫기', 'steelshine', null, 'permanent'],
  ['wb_lucky', '급소 연타', 'bloodpulse', null, 'permanent'],
  ['wb_alliance', '연합의 깃발', 'allianceflow', null, 'permanent'],
  ['wb_last', '홀로 남은 검', 'ashdrift', null, 'permanent'],
  ['wb_shield', '앞장선 방패', 'breath', null, 'permanent'],
  ['wb_merc', '떠돌이 용병', 'linenflow', null, 'permanent'],
  ['wb_kind_ember_phoenix', '잿불 원정대', 'ashdrift', 'ashfeather', 'permanent'],
  ['guild_wb_loot_5', '잿빛 금고', 'ashgoldvault', null, 'conditional'],
];

describe('월드보스 칭호 11종', () => {
  it('전부 공개, 이름 8자 이내, 카테고리 월드보스, 고른 효과·파티클 그대로', () => {
    for (const [code, label, fx, pt, kind] of WB) {
      const d = TITLE_BY_CODE.get(code)!;
      expect(d, code).toBeTruthy();
      expect(d.label).toBe(label);
      expect([...d.label].length).toBeLessThanOrEqual(8);
      expect(d.hidden).toBe(false);
      expect(d.kind).toBe(kind);
      expect(d.cat).toBe('월드보스');
      expect(d.style.fx).toBe(fx);
      expect(d.style.pt ?? null).toBe(pt);
      const s = TITLE_SECRET_BY_CODE.get(code)!;
      expect(s.cond.length, code).toBeGreaterThan(0);
    }
  });
  it('이름이 다른 칭호와 겹치지 않는다(원정대장은 파견 칭호라 쓰지 않는다)', () => {
    const labels = new Map<string, string[]>();
    for (const d of TITLE_BY_CODE.values()) labels.set(d.label, [...(labels.get(d.label) ?? []), d.code]);
    for (const [code, label] of WB) expect(labels.get(label), label).toEqual([code]);
  });
  it('잿빛 금고는 길드 집합 조건부(guild-facts)에 등록', () => {
    expect(GUILD_COLLECTIVE_CODES.has('guild_wb_loot_5')).toBe(true);
  });
});
