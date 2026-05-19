'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import type { Slot } from '@/lib/db/schema/equipment';

import { TranscendSprite } from '@/components/TranscendSprite';

import { toggleLockAction, equipBestSetAction } from './actions';
import { EquipmentDetailSheet } from './EquipmentDetailSheet';

export type InvItem = {
  id: string;
  catalogItemId: number;
  code: string;
  name: string;
  slot: Slot;
  enhanceLevel: number;
  transcendLevel: number;
  isLocked: boolean;
  equipped: boolean;
  acquiredAtMs: number;
  busy: boolean;
  isChampion: boolean;
};

const SLOT_EMOJI: Record<Slot, string> = { weapon: '⚔️', armor: '🛡️', accessory: '💍' };
const NEW_MS = 10 * 60 * 1000;
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
  const [sortBy, setSortBy] = useState<SortBy>('recent');
  const [openId, setOpenId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const sorted = useMemo(() => {
    return items
      .filter((i) => (filter === 'all' ? true : i.slot === filter))
      .sort((a, b) => {
        if (sortBy === 'enhance') return b.enhanceLevel - a.enhanceLevel;
        if (sortBy === 'transcend') return b.transcendLevel - a.transcendLevel;
        return b.acquiredAtMs - a.acquiredAtMs;
      });
  }, [items, filter, sortBy]);

  const equipped = sorted.filter((i) => i.equipped);
  const owned = sorted.filter((i) => !i.equipped);
  const openItem = openId ? items.find((i) => i.id === openId) ?? null : null;

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
          className="rounded-full border border-zinc-300 bg-white px-3 py-1.5 text-xs dark:border-zinc-700 dark:bg-zinc-950"
        >
          <option value="recent">최근순</option>
          <option value="enhance">강화순</option>
          <option value="transcend">초월순</option>
        </select>
      </div>

      <p className="mt-2 text-[10px] text-zinc-400">탭=상세 · 🔓 잠금토글</p>

      {equipped.length > 0 ? (
        <Section title={`장착 중 (${equipped.length})`}>
          {equipped.map((it) => (
            <Tile key={it.id} item={it} onOpen={() => setOpenId(it.id)} />
          ))}
        </Section>
      ) : null}
      <Section title={`보유 (${owned.length})`}>
        {owned.map((it) => (
          <Tile key={it.id} item={it} onOpen={() => setOpenId(it.id)} />
        ))}
      </Section>

      <div className="pointer-events-none fixed inset-x-0 bottom-[4.5rem] z-20">
        <div className="mx-auto flex max-w-[390px] justify-end px-4">
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                await equipBestSetAction();
                router.refresh();
              })
            }
            className="pointer-events-auto rounded-full bg-zinc-900 px-4 py-2 text-xs font-semibold text-white shadow-lg disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-950"
          >
            ⚙️ 최적조합
          </button>
        </div>
      </div>

      {openItem ? (
        <EquipmentDetailSheet
          item={openItem}
          all={items}
          nickname={nickname}
          onClose={() => setOpenId(null)}
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

function Tile({ item, onOpen }: { item: InvItem; onOpen: () => void }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const isNew = Date.now() - item.acquiredAtMs < NEW_MS;
  return (
    <button
      type="button"
      onClick={onOpen}
      disabled={pending}
      className="relative flex aspect-square flex-col items-center justify-center gap-0.5 rounded-xl border-2 border-zinc-200 bg-white px-1 text-center dark:border-zinc-800 dark:bg-zinc-950"
    >
      <TranscendSprite
        code={item.code}
        slot={item.slot}
        level={item.transcendLevel}
        isChampion={item.isChampion}
        size={52}
      />
      <span className="line-clamp-1 px-0.5 text-[10px] text-zinc-600 dark:text-zinc-400">
        {item.name}
      </span>
      <span className="text-xs font-semibold">+{item.enhanceLevel}</span>
      <span className="text-[10px] text-amber-600 dark:text-amber-400">
        ✦T{item.transcendLevel}
      </span>
      {isNew ? (
        <span className="absolute left-1 top-1 rounded-full bg-emerald-500 px-1 text-[8px] font-bold text-white">
          NEW
        </span>
      ) : null}
      <span
        role="button"
        tabIndex={-1}
        aria-label={item.isLocked ? '잠금 해제' : '잠금'}
        onClick={(e) => {
          e.stopPropagation();
          startTransition(async () => {
            await toggleLockAction(item.id);
            router.refresh();
          });
        }}
        className={`absolute right-1 top-1 inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] ${
          item.isLocked
            ? 'bg-amber-500/95 text-white'
            : 'bg-zinc-100/95 text-zinc-400 dark:bg-zinc-800/95'
        }`}
      >
        {item.isLocked ? '🔒' : '🔓'}
      </span>
      {item.busy ? (
        <span className="absolute bottom-1 right-1 rounded-full bg-zinc-900/80 px-1 text-[8px] font-bold text-amber-300">
          ⚒️
        </span>
      ) : null}
    </button>
  );
}
