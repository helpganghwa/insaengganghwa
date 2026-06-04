'use client';

import { memo, useEffect, useMemo, useOptimistic, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import type { Slot } from '@/lib/db/schema/equipment';

import { TranscendSprite } from '@/components/TranscendSprite';
import { RarityFrame, rarityBorderStyle, hasRarityBorder, TranscendTag } from '@/components/RarityFrame';
import { pieceCombatPower } from '@/lib/game/balance';

import { equipBestSetAction } from './actions';
import { EquipmentDetailSheet } from './EquipmentDetailSheet';

export type InvItem = {
  id: string;
  catalogItemId: number;
  code: string;
  name: string;
  slot: Slot;
  enhanceLevel: number;
  transcendLevel: number;
  /** 다음 초월까지 누적된 중복 수(임계 = transcendLevel+1). */
  transcendProgress: number;
  equipped: boolean;
  acquiredAtMs: number;
  busy: boolean;
  isChampion: boolean;
  lore: string | null;
};

const SLOT_EMOJI: Record<Slot, string> = { weapon: '⚔️', armor: '🛡️', accessory: '💍' };
const SLOT_ORDER: Record<Slot, number> = { weapon: 0, armor: 1, accessory: 2 };
const SEEN_STORAGE_KEY = 'ig:seen-items';
type SlotFilter = 'all' | Slot;
type SortBy = 'recent' | 'enhance' | 'transcend';

export function InventoryGrid({
  items,
  initialSlot = 'all',
  nickname,
}: {
  items: InvItem[];
  initialSlot?: SlotFilter;
  nickname: string;
}) {
  const router = useRouter();
  const [filter, setFilter] = useState<SlotFilter>(initialSlot);
  const [sortBy, setSortBy] = useState<SortBy>('enhance');
  const [openId, setOpenId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  // 낙관적 items — 최적조합 클릭 시 클라이언트에서 같은 알고리즘으로 시뮬레이션 후
  // 즉시 화면 반영. 서버 응답 + router.refresh()로 prop 새로 들어오면 자동 fallback.
  const [displayItems, setOptimisticItems] = useOptimistic(items);

  // 장착 중 — 필터 무관, 항상 무기→방어구→장신구 순 노출.
  const equipped = useMemo(() => {
    return displayItems
      .filter((i) => i.equipped)
      .sort((a, b) => SLOT_ORDER[a.slot] - SLOT_ORDER[b.slot]);
  }, [displayItems]);

  // 보유(미장착) — 필터/정렬 적용.
  const owned = useMemo(() => {
    return displayItems
      .filter((i) => !i.equipped)
      .filter((i) => (filter === 'all' ? true : i.slot === filter))
      .sort((a, b) => {
        if (sortBy === 'enhance') return b.enhanceLevel - a.enhanceLevel;
        if (sortBy === 'transcend') return b.transcendLevel - a.transcendLevel;
        return b.acquiredAtMs - a.acquiredAtMs;
      });
  }, [displayItems, filter, sortBy]);

  const openItem = openId ? displayItems.find((i) => i.id === openId) ?? null : null;

  // NEW 표시 — 인벤토리 진입 시점에 캡처(직전 seen에 없는 id) → 이번 방문에 표시.
  const [newIds] = useState<Set<string>>(() => {
    if (typeof window === 'undefined') return new Set();
    try {
      const raw = localStorage.getItem(SEEN_STORAGE_KEY);
      const seen = new Set(raw ? (JSON.parse(raw) as string[]) : []);
      return new Set(items.filter((it) => !seen.has(it.id)).map((it) => it.id));
    } catch {
      return new Set();
    }
  });
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = localStorage.getItem(SEEN_STORAGE_KEY);
      const seen = new Set<string>(raw ? (JSON.parse(raw) as string[]) : []);
      let changed = false;
      for (const it of items) {
        if (!seen.has(it.id)) {
          seen.add(it.id);
          changed = true;
        }
      }
      if (changed) {
        localStorage.setItem(SEEN_STORAGE_KEY, JSON.stringify(Array.from(seen)));
      }
    } catch {
      /* ignore */
    }
  }, [items]);

  const fb = (active: boolean) =>
    active
      ? 'rounded-full bg-zinc-900 px-3 py-1.5 font-medium text-white dark:bg-zinc-50 dark:text-zinc-950'
      : 'rounded-full border border-zinc-300 px-3 py-1.5 text-zinc-600 dark:border-zinc-700 dark:text-zinc-400';

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex gap-1.5">
          <button type="button" className={fb(filter === 'all')} onClick={() => setFilter('all')}>
            전체({items.length})
          </button>
          {(['weapon', 'armor', 'accessory'] as const).map((s) => (
            <button key={s} type="button" className={fb(filter === s)} onClick={() => setFilter(s)}>
              {SLOT_EMOJI[s]}
            </button>
          ))}
        </div>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as SortBy)}
          aria-label="정렬"
          className="rounded-full border border-zinc-300 bg-white px-3 py-1.5 text-base dark:border-zinc-700 dark:bg-zinc-950"
        >
          <option value="recent">최근순</option>
          <option value="enhance">강화순</option>
          <option value="transcend">초월순</option>
        </select>
      </div>

      {equipped.length > 0 ? (
        <Section title={`장착 중 (${equipped.length})`}>
          {equipped.map((it) => (
            <Tile key={it.id} item={it} isNew={newIds.has(it.id)} onOpen={setOpenId} />
          ))}
        </Section>
      ) : null}
      <Section title={`보유 (${owned.length})`}>
        {owned.map((it) => (
          <Tile key={it.id} item={it} isNew={newIds.has(it.id)} onOpen={setOpenId} />
        ))}
      </Section>

      <div className="pointer-events-none fixed inset-x-0 bottom-[4.5rem] z-20">
        <div className="mx-auto flex max-w-[390px] flex-col items-end gap-2 px-4">
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                // 낙관: 같은 알고리즘(슬롯별 pieceCombatPower 최대) 시뮬레이션 후 즉시 반영.
                const bestBySlot = new Map<Slot, { id: string; cp: number }>();
                for (const it of displayItems) {
                  const cp = pieceCombatPower(it.enhanceLevel, it.transcendLevel);
                  const cur = bestBySlot.get(it.slot);
                  if (!cur || cp > cur.cp) bestBySlot.set(it.slot, { id: it.id, cp });
                }
                const bestIds = new Set([...bestBySlot.values()].map((b) => b.id));
                setOptimisticItems(displayItems.map((it) => ({ ...it, equipped: bestIds.has(it.id) })));
                // 장착은 외형 전용 — 랭킹 불변이라 토스트 없음(BALANCE §3.2).
                await equipBestSetAction();
                router.refresh();
              })
            }
            className="pointer-events-auto rounded-full bg-zinc-900 px-4 py-2 text-xs font-semibold text-white shadow-lg disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-950"
          >
            최적조합
          </button>
        </div>
      </div>

      {openItem ? (
        <EquipmentDetailSheet
          item={openItem}
          all={displayItems}
          nickname={nickname}
          onClose={() => setOpenId(null)}
          onOptimisticEquip={(id) => {
            const target = displayItems.find((it) => it.id === id);
            if (!target) return;
            const willEquip = !target.equipped;
            setOptimisticItems(
              displayItems.map((it) => {
                if (it.id === id) return { ...it, equipped: willEquip };
                if (willEquip && it.slot === target.slot && it.equipped)
                  return { ...it, equipped: false };
                return it;
              }),
            );
          }}
          onOptimisticStartEnhance={(id) => {
            startTransition(() => {
              setOptimisticItems(displayItems.map((it) => (it.id === id ? { ...it, busy: true } : it)));
            });
          }}
        />
      ) : null}
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-4">
      <h2 className="text-xs font-medium text-zinc-500">{title}</h2>
      <div className="mt-2 grid grid-cols-3 gap-2">{children}</div>
    </section>
  );
}

// memo — 필터/정렬/낙관 업데이트 시 변하지 않은 타일 리렌더 방지.
const Tile = memo(function Tile({
  item,
  isNew,
  onOpen,
}: {
  item: InvItem;
  isNew: boolean;
  onOpen: (id: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onOpen(item.id)}
      style={{
        ...rarityBorderStyle(item.transcendLevel),
        contentVisibility: 'auto',
        containIntrinsicSize: 'auto 116px',
      }}
      className={`relative flex aspect-square flex-col items-center justify-center gap-0.5 overflow-hidden rounded-xl border-2 bg-white px-1 text-center dark:bg-zinc-950 ${
        hasRarityBorder(item.transcendLevel) ? '' : 'border-zinc-200 dark:border-zinc-800'
      }`}
    >
      <RarityFrame level={item.transcendLevel} />
      <TranscendSprite
        code={item.code}
        slot={item.slot}
        level={item.transcendLevel}
        isChampion={item.isChampion}
        size={64}
        frameless
      />
      <span className="break-keep px-0.5 text-[10px] leading-tight text-zinc-600 dark:text-zinc-400">
        {item.name}
      </span>
      <span className="text-xs font-semibold">
        +{item.enhanceLevel}
        <TranscendTag level={item.transcendLevel} className="ml-1" />
      </span>
      {isNew ? (
        <span className="absolute left-1 top-1 rounded-full bg-emerald-500 px-1 text-[8px] font-bold text-white">
          NEW
        </span>
      ) : null}
    </button>
  );
});
