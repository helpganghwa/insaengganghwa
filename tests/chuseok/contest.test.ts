import { describe, expect, it } from 'vitest';

import { CHUSEOK_CONTEST_ITEMS, CHUSEOK_RANK_REWARDS, contestTitlesFor, nextRewardTierEnd, rankRewardFor } from '@/lib/game/chuseok/config';
import { CHUSEOK_ITEM_KEYS } from '@/lib/game/equipment/catalog-v6';
import { rankRows } from '@/lib/game/chuseok/rank';

/** 한가위 강화 대회 — 순수 규칙(2026-09-22 확정). */
describe('대회 순위 규칙', () => {
  it('단계 높은 순, 같으면 먼저 도달한 사람, 그래도 같으면 userId — 등수는 항상 유일', () => {
    const r = rankRows([
      { userId: 'b', nickname: 'B', level: 120, reachedAt: 200 },
      { userId: 'a', nickname: 'A', level: 120, reachedAt: 100 },
      { userId: 'c', nickname: 'C', level: 300, reachedAt: 900 },
      { userId: 'd', nickname: 'D', level: 0, reachedAt: null },
      { userId: 'e', nickname: 'E', level: 0, reachedAt: 50 },
      { userId: 'g', nickname: 'G', level: 120, reachedAt: 100 },
    ]);
    expect(r.map((x) => [x.rank, x.userId])).toEqual([[1, 'c'], [2, 'a'], [3, 'g'], [4, 'b'], [5, 'e'], [6, 'd']]);
  });

  it('보상 구간: 1·2·3등 단독, 4~5등·6~10등 묶음, 11등 밖 없음 — 상자는 3의 배수', () => {
    expect(rankRewardFor(1)).toEqual({ diamond: 30_000, boxes: 600 });
    expect(rankRewardFor(2)).toEqual({ diamond: 20_000, boxes: 300 });
    expect(rankRewardFor(3)).toEqual({ diamond: 10_000, boxes: 150 });
    expect(rankRewardFor(4)).toEqual(rankRewardFor(5));
    expect(rankRewardFor(6)).toEqual(rankRewardFor(10));
    expect(rankRewardFor(11)).toBeNull();
    for (const t of CHUSEOK_RANK_REWARDS) expect(t.boxes % 3).toBe(0);
  });

  it('다음 보상 구간까지: 8등→5등, 5등→3등, 2등→1등, 1등→없음, 14등→10등', () => {
    expect(nextRewardTierEnd(8)).toBe(5);
    expect(nextRewardTierEnd(5)).toBe(3);
    expect(nextRewardTierEnd(2)).toBe(1);
    expect(nextRewardTierEnd(1)).toBeNull();
    expect(nextRewardTierEnd(14)).toBe(10);
  });

  it('칭호: 도달한 등수 이하 전부(1등이면 세 개), 4등 밖은 없음, 벌마다 코드가 다르다', () => {
    expect(contestTitlesFor('moon', 1)).toEqual(['chuseok26_moon1', 'chuseok26_moon2', 'chuseok26_moon3']);
    expect(contestTitlesFor('moon', 3)).toEqual(['chuseok26_moon3']);
    expect(contestTitlesFor('flower', 2)).toEqual(['chuseok26_flower2', 'chuseok26_flower3']);
    expect(contestTitlesFor('flower', 4)).toEqual([]);
  });

  it('대회 대상 6종 = 카탈로그 6차 편성과 일치, 벌은 3:3', () => {
    expect(CHUSEOK_CONTEST_ITEMS.map((i) => i.code).sort()).toEqual([...CHUSEOK_ITEM_KEYS].sort());
    expect(CHUSEOK_CONTEST_ITEMS.filter((i) => i.set === 'moon')).toHaveLength(3);
    expect(CHUSEOK_CONTEST_ITEMS.filter((i) => i.set === 'flower')).toHaveLength(3);
  });
});
