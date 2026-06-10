'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';

type Slot = 'weapon' | 'armor' | 'accessory';
type Equipped = { slot: Slot; code: string; enhance: number };
export type RichMember = {
  userId: string;
  nickname: string;
  publicCode: string;
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
  { key: 'contribution', label: '기여도' },
  { key: 'combat', label: '전투력' },
  { key: 'maxEnhance', label: '최고강화' },
  { key: 'totalEnhance', label: '합산강화' },
];
const SLOT_ORDER: Slot[] = ['weapon', 'armor', 'accessory'];
// 직책 — 아바타 코너 배지(단일 글자). 이름 옆 텍스트 배지는 긴 닉네임에서 줄바꿈/잘림
// 문제가 있어, 공간을 차지하지 않는 아바타 코너 마크로 표시(장=길드장, 부=부길드장).
const ROLE_MARK: Record<RichMember['role'], { char: string; cls: string; title: string } | null> = {
  leader: { char: '장', cls: 'bg-amber-500 text-white', title: '길드장' },
  vice: { char: '부', cls: 'bg-sky-500 text-white', title: '부길드장' },
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
    return <span className="h-10 w-10 shrink-0 rounded-md bg-zinc-100 dark:bg-zinc-800" />;
  }
  return (
    <span className="relative h-10 w-10 shrink-0 overflow-hidden rounded-md bg-zinc-100 dark:bg-zinc-800">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`/sprites/${item.slot}/${item.code}.png`}
        alt=""
        aria-hidden
        className="h-full w-full object-contain"
        style={{ imageRendering: 'pixelated' }}
      />
      {item.enhance > 0 && (
        <span className="absolute bottom-0 right-0 rounded-tl bg-black/65 px-0.5 text-[9px] font-bold leading-tight text-amber-300">
          +{item.enhance}
        </span>
      )}
    </span>
  );
}

function MemberRow({ m, myUserId, sort, sortLabel }: { m: RichMember; myUserId: string; sort: SortKey; sortLabel: string }) {
  const mark = ROLE_MARK[m.role];
  const bySlot = new Map(m.equipped.map((e) => [e.slot, e]));
  return (
    <li>
      <Link
        href={`/u/${encodeURIComponent(m.publicCode)}`}
        className="flex items-center gap-3 py-2 active:opacity-70"
      >
        {/* 왼쪽: 아바타(직책 코너 배지) + (닉네임 / 메트릭) */}
        <span className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-zinc-100 dark:bg-zinc-800">
          {m.avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={m.avatar}
              alt=""
              aria-hidden
              className="h-full w-full object-contain"
              style={{ imageRendering: 'pixelated', transform: 'scale(1.2)' }}
            />
          ) : null}
          {mark && (
            <span
              title={mark.title}
              className={`absolute left-0.5 top-0.5 z-10 flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold shadow-[0_1px_2px_rgba(0,0,0,0.4)] ${mark.cls}`}
            >
              {mark.char}
            </span>
          )}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1">
            <span
              className={`truncate text-[13px] font-semibold ${m.userId === myUserId ? 'text-amber-700 dark:text-amber-300' : ''}`}
            >
              {m.nickname}
            </span>
          </div>
          <p className="mt-0.5 text-[11px] text-zinc-500">
            {sortLabel}{' '}
            <span className="font-mono font-bold tabular-nums text-zinc-700 dark:text-zinc-300">
              {metricText(m, sort)}
            </span>
          </p>
        </div>

        {/* 오른쪽: 장비 3종 가로 */}
        <div className="flex shrink-0 gap-1.5">
          {SLOT_ORDER.map((slot) => (
            <EquipIcon key={slot} item={bySlot.get(slot)} />
          ))}
        </div>
      </Link>
    </li>
  );
}

const ROLE_RANK: Record<RichMember['role'], number> = { leader: 0, vice: 1, member: 2 };

export function GuildMemberList({ members, myUserId }: { members: RichMember[]; myUserId: string }) {
  const [sort, setSort] = useState<SortKey>('contribution');
  const sortLabel = SORTS.find((s) => s.key === sort)!.label;

  // 운영진(길드장/부길드장) — 정렬 무관 상단 고정(직책순). 일반 길드원 — 선택 메트릭 정렬.
  const officers = useMemo(
    () =>
      members
        .filter((m) => m.role !== 'member')
        .sort((a, b) => ROLE_RANK[a.role] - ROLE_RANK[b.role] || a.nickname.localeCompare(b.nickname)),
    [members],
  );
  const regulars = useMemo(
    () =>
      members
        .filter((m) => m.role === 'member')
        .sort((a, b) => b[sort] - a[sort] || a.nickname.localeCompare(b.nickname)),
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

      {/* 운영진 — 상단 고정(직책순). 일반 길드원과 divider로 심플 구분. */}
      {officers.length > 0 && (
        <ul className="mt-2 divide-y divide-zinc-100 dark:divide-zinc-800/70">
          {officers.map((m) => (
            <MemberRow key={m.userId} m={m} myUserId={myUserId} sort={sort} sortLabel={sortLabel} />
          ))}
        </ul>
      )}
      {officers.length > 0 && regulars.length > 0 && (
        <div className="my-1 border-t-2 border-dashed border-zinc-200 dark:border-zinc-800" />
      )}

      {/* 일반 길드원 — 정렬 적용 */}
      <ul className="divide-y divide-zinc-100 dark:divide-zinc-800/70">
        {regulars.map((m) => (
          <MemberRow key={m.userId} m={m} myUserId={myUserId} sort={sort} sortLabel={sortLabel} />
        ))}
      </ul>
    </section>
  );
}
