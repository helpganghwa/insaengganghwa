'use client';

import { useMemo, useState } from 'react';

type Slot = 'weapon' | 'armor' | 'accessory';
type Equipped = { slot: Slot; code: string; enhance: number };
export type RichMember = {
  userId: string;
  nickname: string;
  role: 'leader' | 'vice' | 'member';
  avatar: string | null;
  contribution: number;
  combat: number;
  maxEnhance: number;
  totalEnhance: number;
  equipped: Equipped[];
};

type SortKey = 'combat' | 'maxEnhance' | 'totalEnhance' | 'contribution';
const SORTS: { key: SortKey; label: string }[] = [
  { key: 'combat', label: '전투력' },
  { key: 'maxEnhance', label: '최고강화' },
  { key: 'totalEnhance', label: '합산강화' },
  { key: 'contribution', label: '기여도' },
];
const SLOT_ORDER: Slot[] = ['weapon', 'armor', 'accessory'];
const ROLE_BADGE: Record<RichMember['role'], { label: string; cls: string } | null> = {
  leader: { label: '길드장', cls: 'bg-amber-500/15 text-amber-700 dark:text-amber-300' },
  vice: { label: '부길드장', cls: 'bg-sky-500/15 text-sky-700 dark:text-sky-300' },
  member: null,
};

function metricText(m: RichMember, key: SortKey): string {
  switch (key) {
    case 'combat':
      return m.combat.toLocaleString('ko-KR');
    case 'maxEnhance':
      return `+${m.maxEnhance}`;
    case 'totalEnhance':
      return `+${m.totalEnhance.toLocaleString('ko-KR')}`;
    case 'contribution':
      return m.contribution.toLocaleString('ko-KR');
  }
}

function EquipIcon({ item }: { item: Equipped | undefined }) {
  if (!item) {
    return <span className="h-5 w-5 shrink-0 rounded bg-zinc-100 dark:bg-zinc-800" />;
  }
  return (
    <span className="relative h-5 w-5 shrink-0 overflow-hidden rounded bg-zinc-100 dark:bg-zinc-800">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`/sprites/${item.slot}/${item.code}.png`}
        alt=""
        aria-hidden
        className="h-full w-full object-contain"
        style={{ imageRendering: 'pixelated' }}
      />
      {item.enhance > 0 && (
        <span className="absolute bottom-0 right-0 rounded-tl bg-black/65 px-0.5 text-[7px] font-bold leading-tight text-amber-300">
          +{item.enhance}
        </span>
      )}
    </span>
  );
}

export function GuildMemberList({ members, myUserId }: { members: RichMember[]; myUserId: string }) {
  const [sort, setSort] = useState<SortKey>('combat');

  const sorted = useMemo(
    () => [...members].sort((a, b) => b[sort] - a[sort] || a.nickname.localeCompare(b.nickname)),
    [members, sort],
  );

  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-bold">길드원 ({members.length})</h3>
        <div className="flex gap-1 rounded-lg bg-zinc-100 p-0.5 dark:bg-zinc-900">
          {SORTS.map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => setSort(s.key)}
              className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold transition ${
                sort === s.key
                  ? 'bg-white text-zinc-900 shadow-sm dark:bg-zinc-950 dark:text-zinc-50'
                  : 'text-zinc-500'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <ul className="mt-2 space-y-1">
        {sorted.map((m) => {
          const badge = ROLE_BADGE[m.role];
          const bySlot = new Map(m.equipped.map((e) => [e.slot, e]));
          return (
            <li key={m.userId} className="flex items-center gap-2 py-1">
              {/* 아바타 */}
              <span className="h-9 w-9 shrink-0 overflow-hidden rounded-lg bg-zinc-100 dark:bg-zinc-800">
                {m.avatar ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={m.avatar}
                    alt=""
                    aria-hidden
                    className="h-full w-full object-contain"
                    style={{ imageRendering: 'pixelated' }}
                  />
                ) : null}
              </span>

              {/* 닉 + 장비 3종 */}
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-center gap-1">
                  <span
                    className={`truncate text-[13px] font-semibold ${m.userId === myUserId ? 'text-amber-700 dark:text-amber-300' : ''}`}
                  >
                    {m.nickname}
                  </span>
                  {badge && (
                    <span className={`shrink-0 rounded-full px-1.5 py-0 text-[9px] font-bold ${badge.cls}`}>
                      {badge.label}
                    </span>
                  )}
                </div>
                <div className="mt-0.5 flex gap-1">
                  {SLOT_ORDER.map((slot) => (
                    <EquipIcon key={slot} item={bySlot.get(slot)} />
                  ))}
                </div>
              </div>

              {/* 정렬 메트릭 */}
              <span className="shrink-0 text-right font-mono text-[12px] font-bold tabular-nums text-zinc-700 dark:text-zinc-300">
                {metricText(m, sort)}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
