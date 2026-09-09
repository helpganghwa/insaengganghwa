import { afterAll, describe, expect, it } from 'vitest';

import { FIRST_MILESTONES } from '@/lib/game/balance';
import { TITLE_BY_CODE, TITLE_DEFS } from '@/lib/game/titles/defs';
import { TITLE_SECRET_BY_CODE } from '@/lib/game/titles/defs.server';
import { loadFirstRanks, recordFirstMilestones } from '@/lib/game/titles/first-milestones';

import { endTestDb, sql, testDb } from '../db';

/**
 * 최초 이정표 칭호(2026-09-09, 검토 20·22차 확정) — 정의 24종(8 이정표 × 금·은·동) + 기록 함수(첫 세 사람·멱등·넷째 없음).
 * DB 검증은 한 트랜잭션 안에서 세이브포인트로 돌고 ROLLBACK — 실 DB 무오염.
 */
const USER = process.env.TEST_USER_ID ?? '';
const SERVER_ID = 1;
const ROLLBACK = new Error('ROLLBACK');
type Tx = Parameters<Parameters<typeof testDb.transaction>[0]>[0];
const NAMES: Record<string, [string, string]> = {
  enh500: ['고수', '高手'], enh1000: ['파천황', '破天荒'], combat5m: ['일기당천', '一騎當千'], combat10m: ['천하제일', '天下第一'],
  t20: ['초인', '超人'], t40: ['천외천', '天外天'], sum20k: ['지존', '至尊'], sum30k: ['전설', '傳說'],
};

describe('최초 이정표 — 정의', () => {
  it('8 이정표 × 금·은·동 24종, 영구·한정, 이름은 셋이 같고 한자 병기·재질만 다르다', () => {
    const codes = TITLE_DEFS.filter((t) => /^first_\w+_[123]$/.test(t.code)); // first_bitter(첫 쓴맛) 제외
    expect(codes).toHaveLength(24);
    for (const m of FIRST_MILESTONES) {
      const [kr, hj] = NAMES[m.key]!;
      for (const r of [1, 2, 3] as const) {
        const d = TITLE_BY_CODE.get(`first_${m.key}_${r}`)!;
        expect(d.kind).toBe('permanent');
        expect(d.label).toBe(kr);
        expect(d.style).toMatchObject({ fx: r === 1 ? 'firstgold' : r === 2 ? 'firstsilver' : 'firstbronze', hanja: hj });
        expect(TITLE_SECRET_BY_CODE.get(d.code)!.diff).toBe('한정');
      }
    }
  });

  it('임계는 단조 증가(같은 축에서 뒤 단계가 더 높다)', () => {
    const byMetric = new Map<string, number[]>();
    for (const m of FIRST_MILESTONES) byMetric.set(m.metric, [...(byMetric.get(m.metric) ?? []), m.value]);
    for (const vs of byMetric.values()) for (let i = 1; i < vs.length; i++) expect(vs[i]!).toBeGreaterThan(vs[i - 1]!);
  });
});

describe('최초 이정표 — 기록', () => {
  afterAll(endTestDb);

  it('임계 미만이면 기록 없음 · 첫 세 사람만 1·2·3 · 같은 유저 멱동 · 넷째는 없음 · 지표 fr_*로 읽힌다', async () => {
    if (!USER) return;
    await expect(
      testDb.transaction(async (tx: Tx) => {
        const runner = { transaction: <T>(fn: (t: Tx) => Promise<T>) => tx.transaction(fn) } as unknown as Parameters<typeof recordFirstMilestones>[3];
        await tx.execute(sql`delete from milestone_firsts where server_id = ${SERVER_ID} and milestone in ('enh500', 't20')`);
        const others = (await tx.execute(sql`
          select user_id::text as id from characters where server_id = ${SERVER_ID} and user_id <> ${USER}::uuid order by user_id limit 3
        `)) as unknown as { id: string }[];
        expect(others.length).toBe(3);
        // 임계 미만 → 아무것도 없음
        expect(await recordFirstMilestones(USER, SERVER_ID, { max: 499, transcend: 19 }, runner)).toEqual([]);
        // 첫 도달 → 1등(두 이정표 동시)
        expect(await recordFirstMilestones(USER, SERVER_ID, { max: 500, transcend: 20 }, runner)).toEqual([['enh500', 1], ['t20', 1]]);
        // 같은 유저 재호출 → 멱등
        expect(await recordFirstMilestones(USER, SERVER_ID, { max: 520, transcend: 21 }, runner)).toEqual([]);
        // 둘째·셋째
        expect(await recordFirstMilestones(others[0]!.id, SERVER_ID, { max: 500 }, runner)).toEqual([['enh500', 2]]);
        expect(await recordFirstMilestones(others[1]!.id, SERVER_ID, { max: 500 }, runner)).toEqual([['enh500', 3]]);
        // 넷째 → 자리 없음
        expect(await recordFirstMilestones(others[2]!.id, SERVER_ID, { max: 500 }, runner)).toEqual([]);
        // 지표
        const mine = await loadFirstRanks(USER, SERVER_ID, tx);
        expect(mine.fr_enh500).toBe(1);
        expect(mine.fr_t20).toBe(1);
        expect(mine.fr_sum20k).toBe(0);
        const third = await loadFirstRanks(others[1]!.id, SERVER_ID, tx);
        expect(third.fr_enh500).toBe(3);
        throw ROLLBACK;
      }),
    ).rejects.toBe(ROLLBACK);
  });
});
