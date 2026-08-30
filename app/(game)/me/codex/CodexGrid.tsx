'use client';
import { PageHeader } from '@/components/ui/PageHeader';

import { useMemo, useState } from 'react';
import Link from 'next/link';

import { atlasMaskStyle } from '@/lib/game/equipment/sprite-atlas';
import { TranscendSprite } from '@/components/TranscendSprite';
import type { Slot } from '@/lib/db/schema/equipment';
import { ZoomSafeSelect } from '@/components/ui/ZoomSafeField';
import type { CatalogRegion } from '@/lib/game/equipment/catalog';
import { REGION_FILTER_ORDER, catalogRegionUi } from '@/lib/game/equipment/region-ui';

const SLOT_EMOJI: Record<Slot, string> = { weapon: '⚔️', armor: '🛡️', accessory: '💍' };
type SlotFilter = 'all' | Slot;
type SortBy = 'enhance' | 'name';

export type CodexItem = {
  id: number;
  code: string;
  name: string;
  slot: Slot;
  /** 카탈로그 지역(2026-08-30) — 지역 필터. */
  region: CatalogRegion;
  got: boolean;
  /** 획득 시 최고 강화 레벨(미획득 null). */
  max: number | null;
  /** 해방 순위(1~3, 없으면 null). */
  rank: number | null;
};

/**
 * 도감 그리드 — 인벤토리와 동일한 분류 필터(전체/⚔️/🛡️/💍) + 정렬(강화순/이름순).
 * 필터·정렬은 클라 상태라 서버 페이지에서 분리(2026-07-23 유저 건의 #66).
 * 기본 정렬 = 강화순(내 장비 중 가장 강화된 것을 위로 — 건의 취지). 미획득은 항상 뒤로.
 */
export function CodexGrid({ items }: { items: CodexItem[] }) {
  const [filter, setFilter] = useState<SlotFilter | 'missing'>('all');
  const [sortBy, setSortBy] = useState<SortBy>('enhance');
  const [regionFilter, setRegionFilter] = useState<'all' | CatalogRegion>('all');

  const shown = useMemo(() => {
    // 'missing' — 아직 못 모은 것만. 강화순 정렬이라 미획득이 항상 뒤로 밀려 끝까지
    // 스크롤해야 보이던 것을 한 번에 가른다(2026-08-02).
    const list = items
      .filter((i) => (filter === 'all' ? true : filter === 'missing' ? !i.got : i.slot === filter))
      .filter((i) => regionFilter === 'all' || i.region === regionFilter);
    const sorted = [...list];
    if (sortBy === 'enhance') {
      // 강화순 — 획득(max) 내림차순, 미획득(null→-1)은 뒤로, 동순위는 이름.
      sorted.sort((a, b) => (b.max ?? -1) - (a.max ?? -1) || a.name.localeCompare(b.name, 'ko'));
    } else {
      sorted.sort((a, b) => a.name.localeCompare(b.name, 'ko'));
    }
    return sorted;
  }, [items, filter, regionFilter, sortBy]);

  const missing = useMemo(() => items.filter((i) => !i.got).length, [items]);

  const fb = (active: boolean) =>
    active
      ? 'rounded-full bg-zinc-900 px-3 py-1.5 font-medium text-white dark:bg-zinc-50 dark:text-zinc-950'
      : 'rounded-full border border-zinc-300 px-3 py-1.5 text-zinc-600 dark:border-zinc-700 dark:text-zinc-400';

  return (
    <div className="px-4 pb-4 pt-3">
      <PageHeader title="도감" fallback="/me" />
      <div className="h-3" />
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex gap-1.5">
          <button type="button" className={fb(filter === 'all')} onClick={() => setFilter('all')}>
            전체({items.length})
          </button>
          {(['weapon', 'armor', 'accessory'] as const).map((s) => (
            <button key={s} type="button" className={fb(filter === s)} onClick={() => setFilter(s)}>
              {SLOT_EMOJI[s]}
            </button>
          ))}
          {missing > 0 ? (
            <button
              type="button"
              className={fb(filter === 'missing')}
              onClick={() => setFilter('missing')}
            >
              미획득 {missing}
            </button>
          ) : null}
        </div>
      </div>
      {/* 2줄째(2026-08-30): 정렬 + 지역 필터(인벤토리와 동일 구성). */}
      <div className="mb-3 flex items-center gap-2 text-xs">
        {/* 정렬 — 인벤토리와 동일 컴팩트 셀렉트(네이티브 화살표 제거 후 ▼ 직접). */}
        <ZoomSafeSelect
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as SortBy)}
          aria-label="정렬 기준"
          wrapClassName="h-[30px] w-[92px] shrink-0"
          className="rounded-full border border-zinc-300 bg-transparent pl-3 pr-7 text-zinc-600 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-400"
        >
          <option value="enhance">강화순</option>
          <option value="name">이름순</option>
        </ZoomSafeSelect>
        <ZoomSafeSelect
          value={regionFilter}
          onChange={(e) => setRegionFilter(e.target.value as 'all' | CatalogRegion)}
          aria-label="지역 필터"
          wrapClassName="h-[30px] w-[132px] shrink-0"
          className="rounded-full border border-zinc-300 bg-transparent pl-3 pr-7 text-zinc-600 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-400"
        >
          <option value="all">모든 지역</option>
          {REGION_FILTER_ORDER.map((r) => (
            <option key={r} value={r}>
              {catalogRegionUi(r).label}
            </option>
          ))}
        </ZoomSafeSelect>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {shown.map((c) => {
          if (!c.got) {
            // 미획득 — 실제 스프라이트를 단색 실루엣(형태만)으로. 스프라이트 없으면 슬롯 이모지 폴백.
            const mask = atlasMaskStyle(c.code, 40);
            return (
              <div
                key={c.id}
                className="flex aspect-square flex-col items-center justify-center gap-0.5 rounded-xl border-2 border-dashed border-zinc-200 bg-zinc-50 p-1 text-center dark:border-zinc-800 dark:bg-zinc-900"
              >
                {mask ? (
                  <div aria-hidden className="bg-zinc-400 dark:bg-zinc-600" style={mask} />
                ) : (
                  <span className="text-2xl opacity-40" style={{ filter: 'grayscale(1)' }}>
                    {SLOT_EMOJI[c.slot]}
                  </span>
                )}
                <span className="px-0.5 text-[9px] leading-tight text-zinc-500 dark:text-zinc-500">미획득</span>
              </div>
            );
          }
          return (
            <Link
              prefetch={false}
              key={c.id}
              href={`/me/codex/${c.id}`}
              className="flex aspect-square flex-col items-center justify-center gap-0.5 rounded-xl border-2 border-zinc-200 bg-white p-1 text-center dark:border-zinc-800 dark:bg-zinc-950"
            >
              <TranscendSprite code={c.code} slot={c.slot} level={0} championRank={c.rank} size={40} frameless />
              <span className="px-0.5 text-[9px] leading-tight text-zinc-600 dark:text-zinc-400">{c.name}</span>
              <span className="text-[10px] font-semibold text-amber-600 dark:text-amber-400">+{c.max}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
