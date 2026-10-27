import { describe, expect, it } from 'vitest';

import {
  HALLOWEEN_CONTEST_ITEMS,
  HALLOWEEN_ITEM_CODES,
  HALLOWEEN_RANK_REWARDS,
  HALLOWEEN_RANK_TITLES,
  HALLOWEEN_START_MS,
  contestTitlesFor,
  halloweenItemsOpen,
  nextRewardTierEnd,
  rankRewardFor,
} from '@/lib/game/halloween/config';
import { CHUSEOK_RANK_REWARDS } from '@/lib/game/chuseok/config';
import { HALLOWEEN_ITEM_KEYS } from '@/lib/game/equipment/catalog-v7';
import { CATALOG_ITEMS } from '@/lib/game/equipment/catalog';

/** 할로윈 강화 대회 — 순수 규칙(2026-10-20 확정: 보상표는 추석 그대로, 칭호는 6종 공통 3개). */
describe('할로윈 대회 규칙', () => {
  it('보상표는 추석과 같다', () => {
    expect(HALLOWEEN_RANK_REWARDS).toEqual(CHUSEOK_RANK_REWARDS);
    expect(rankRewardFor(1)).toEqual({ diamond: 30_000, boxes: 600 });
    expect(rankRewardFor(10)).toEqual({ diamond: 3_000, boxes: 60 });
    expect(rankRewardFor(11)).toBeNull();
    expect(nextRewardTierEnd(8)).toBe(5);
    expect(nextRewardTierEnd(1)).toBeNull();
  });

  it('칭호는 6종 공통: 도달한 등수 이하 전부, 4등 밖은 없음', () => {
    const [PK, NF, PH] = ['halloween26_rank1', 'halloween26_rank2', 'halloween26_rank3'];
    expect(contestTitlesFor('halloween_smith_hammer', 1)).toEqual([PK, NF, PH]);
    expect(contestTitlesFor('halloween_smith_apron', 1)).toEqual([NF, PH, PK]);
    expect(contestTitlesFor('halloween_smith_apron', 2)).toEqual([PH, PK]);
    expect(contestTitlesFor('halloween_vamp_tophat', 3)).toEqual([PK]);
    expect(contestTitlesFor('halloween_smith_hammer', 4)).toEqual([]);
    expect(contestTitlesFor('halloween_smith_hammer', 0)).toEqual([]);
    expect(contestTitlesFor('nope', 1)).toEqual([]);
    // 1등은 어느 장비든 3종 모두.
    for (const it of HALLOWEEN_CONTEST_ITEMS) expect([...contestTitlesFor(it.code, 1)].sort()).toEqual([...HALLOWEEN_RANK_TITLES].sort());
    // 여섯 가지 순서가 모두 다르고, 각 칭호가 1·2·3등에 두 번씩.
    expect(new Set(HALLOWEEN_CONTEST_ITEMS.map((i) => i.titles.join())).size).toBe(6);
    for (const code of HALLOWEEN_RANK_TITLES) for (let pos = 0; pos < 3; pos++)
      expect(HALLOWEEN_CONTEST_ITEMS.filter((i) => i.titles[pos] === code).length).toBe(2);
  });

  it('대회 대상 6종 = 카탈로그 7차 편성, 슬롯당 2종, 전부 카탈로그에 있다', () => {
    expect(HALLOWEEN_CONTEST_ITEMS.map((i) => i.code).sort()).toEqual([...HALLOWEEN_ITEM_KEYS].sort());
    const bySlot = new Map<string, number>();
    for (const code of HALLOWEEN_ITEM_CODES) {
      const c = CATALOG_ITEMS.find((x) => x.key === code);
      expect(c, code).toBeDefined();
      expect(c!.region).toBe('일반');
      bySlot.set(c!.slot, (bySlot.get(c!.slot) ?? 0) + 1);
    }
    expect(Object.fromEntries(bySlot)).toEqual({ weapon: 2, armor: 2, accessory: 2 });
  });

  it('6종 공개 시각 게이트 — 시작 정각 전엔 닫히고 정각부터 열린다', () => {
    expect(halloweenItemsOpen(HALLOWEEN_START_MS - 1)).toBe(false);
    expect(halloweenItemsOpen(HALLOWEEN_START_MS)).toBe(true);
    expect(halloweenItemsOpen(new Date(HALLOWEEN_START_MS + 1))).toBe(true);
  });
});
