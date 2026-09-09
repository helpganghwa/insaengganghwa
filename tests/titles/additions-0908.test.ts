import { afterEach, describe, expect, it } from 'vitest';

import { TITLE_BY_CODE, TITLE_DEFS } from '@/lib/game/titles/defs';
import { TITLE_SECRET_BY_CODE } from '@/lib/game/titles/defs.server';
import { discoverTitles } from '@/lib/game/titles/judge';

import { endTestDb } from '../db';

/** 2026-09-08 칭호 추가 14종(검토 폼 결과) — 정의(생성물)·판정 스모크. */
const SETS = ['set_thunder_knight', 'set_star_navigator', 'set_ash_scythe', 'set_marsh_bugler', 'set_dusk_pilgrim', 'set_academy_fencer', 'set_ball_guest', 'set_dragon_warden', 'set_desert_patrol'];
const RULES = ['star_sea', 'binge_500', 'fatalist', 'lunchbox', 'drifter_100'];

describe('칭호 추가 0908 — 정의', () => {
  it('총 531종, 라벨 중복 없음(최초 이정표 금·은·동은 이름 공유)', () => {
    expect(TITLE_DEFS).toHaveLength(531);
    const labels = TITLE_DEFS.filter((t) => !/^first_\w+_[123]$/.test(t.code)).map((t) => t.label);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it('장비 조합 9종은 숨김·조건부이며 카탈로그 키 3개 req로 파싱된다', () => {
    for (const code of SETS) {
      const d = TITLE_BY_CODE.get(code)!;
      expect(d.hidden).toBe(true);
      expect(d.kind).toBe('conditional');
      const s = TITLE_SECRET_BY_CODE.get(code)!;
      expect(s.req?.items).toHaveLength(3);
      expect(s.req!.min).toBeGreaterThanOrEqual(30);
    }
    expect(TITLE_SECRET_BY_CODE.get('set_dragon_warden')!.req!.min).toBe(100);
  });

  it('개인 1위 5종은 불꽃(V3) — 의만 회백, 맹주·군사는 궁서 세로 광택 금/은(20차 확정)', () => {
    expect(TITLE_BY_CODE.get('rank_combat')!.style).toMatchObject({ fx: 'blazegold' });
    expect(TITLE_BY_CODE.get('rank_max')!.style).toMatchObject({ fx: 'blaze', fxOnly: ['불', '정점'], plainColor: '#b8bcc6' });
    expect(TITLE_BY_CODE.get('rank_sum')!.style).toMatchObject({ fx: 'blazesteel', fxOnly: ['강철', '군주'] });
    expect(TITLE_BY_CODE.get('rank_raid')!.style).toMatchObject({ fx: 'blazecrimson' });
    expect(TITLE_BY_CODE.get('rank_melee')!.style).toMatchObject({ fx: 'blazeviolet', fxOnly: ['투기장', '왕'] });
    for (const code of ['guild_top_leader', 'guild_top_vice']) {
      const d = TITLE_BY_CODE.get(code)!;
      expect(d.kind).toBe('conditional');
      expect(d.hidden).toBe(false);
      expect(d.style).toMatchObject({ fx: code === 'guild_top_leader' ? 'lordgold' : 'lordsilver' });
    }
    expect(TITLE_BY_CODE.get('guild_top_leader')!.label).toBe('맹주');
    expect(TITLE_BY_CODE.get('guild_top_vice')!.label).toBe('군사');
    expect(TITLE_SECRET_BY_CODE.get('guild_top_vice')!.cond).toBe('길드 랭킹 1위 길드의 부길드장인 동안');
  });

  it('지표형 5종은 영구이며 "운명"은 5연속 개봉 조건', () => {
    for (const code of RULES) expect(TITLE_BY_CODE.get(code)!.kind).toBe('permanent');
    expect(TITLE_BY_CODE.get('fatalist')!.label).toBe('운명');
    expect(TITLE_SECRET_BY_CODE.get('fatalist')!.cond).toBe('같은 아이템을 5연속 개봉');
  });
});

const TEST_USER_ID = process.env.TEST_USER_ID ?? '';
const skip = !TEST_USER_ID;

describe.skipIf(skip)('칭호 추가 0908 — 판정 스모크(DB)', () => {
  it('지표 수집(점심·5연속 SQL 추가)이 에러 없이 돈다', async () => {
    const r = await discoverTitles(TEST_USER_ID, 1);
    expect(r.active).toBeInstanceOf(Set);
  });
});

if (!skip) {
  afterEach(() => undefined);
  process.on('beforeExit', () => void endTestDb());
}
