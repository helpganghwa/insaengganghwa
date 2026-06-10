'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';

import { LastSeen } from '@/components/LastSeen';

type Slot = 'weapon' | 'armor' | 'accessory';
type Equipped = { slot: Slot; code: string; enhance: number };
export type RichMember = {
  userId: string;
  nickname: string;
  publicCode: string;
  role: 'leader' | 'vice' | 'member';
  avatar: string | null;
  /** 마지막 접속(ISO) — 접속 상태 표시. 없으면 null. */
  lastSeenAt: string | null;
  contribution: number;
  combat: number;
  maxEnhance: number;
  totalEnhance: number;
  equipped: Equipped[];
};

type SortKey = 'combat' | 'contribution' | 'lastSeen';
const SORTS: { key: SortKey; label: string }[] = [
  { key: 'contribution', label: '기여도' },
  { key: 'combat', label: '전투력' },
  { key: 'lastSeen', label: '최근접속' },
];
const SLOT_ORDER: Slot[] = ['weapon', 'armor', 'accessory'];

/** 좁은 카드용 컴팩트 수치(예: 53,000 → 5.3만). */
function fmtNum(n: number): string {
  return new Intl.NumberFormat('ko-KR', { notation: 'compact', maximumFractionDigits: 1 }).format(n);
}

/** 정렬용 수치 — 최근접속은 epoch(최신 우선, 기록 없으면 0=맨 뒤). 그 외는 메트릭 값. */
function sortValue(m: RichMember, key: SortKey): number {
  if (key === 'lastSeen') return m.lastSeenAt ? Date.parse(m.lastSeenAt) : 0;
  return m[key];
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

function MemberRow({ m, myUserId }: { m: RichMember; myUserId: string }) {
  const bySlot = new Map(m.equipped.map((e) => [e.slot, e]));
  const isMe = m.userId === myUserId;
  return (
    <li>
      <Link
        href={`/u/${encodeURIComponent(m.publicCode)}`}
        className="flex items-center gap-2 py-1.5 active:opacity-70"
      >
        {/* 아바타 */}
        <span className="h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-zinc-100 dark:bg-zinc-800">
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
        </span>

        {/* 가운데: (닉네임 + 최근접속) / (기여 · 전투) */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="min-w-0 flex-1 text-[10px] font-semibold">{m.nickname}</span>
            {/* 최근접속 — 닉네임 오른쪽 고정 슬롯(좌측 정렬). */}
            <span className="w-[52px] shrink-0 text-left text-[10px] text-zinc-400">
              {isMe || m.lastSeenAt != null ? (
                <LastSeen at={m.lastSeenAt} forceOnline={isMe} className="justify-start" />
              ) : null}
            </span>
          </div>
          <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-zinc-500">
            <span className="truncate">
              기여도 <span className="font-semibold tabular-nums text-zinc-700 dark:text-zinc-300">{fmtNum(m.contribution)}</span>
            </span>
            <span className="text-zinc-300 dark:text-zinc-700">·</span>
            <span className="truncate">
              전투력 <span className="font-semibold tabular-nums text-zinc-700 dark:text-zinc-300">{fmtNum(m.combat)}</span>
            </span>
          </div>
        </div>

        {/* 장비 3종 — 아바타와 동일 크기 */}
        <div className="flex shrink-0 gap-1">
          {SLOT_ORDER.map((slot) => (
            <EquipIcon key={slot} item={bySlot.get(slot)} />
          ))}
        </div>
      </Link>
    </li>
  );
}

export function GuildMemberList({ members, myUserId }: { members: RichMember[]; myUserId: string }) {
  const [sort, setSort] = useState<SortKey>('contribution');

  // 직책별 그룹(길드장/부길드장/길드원) — 각 그룹 내부는 선택한 메트릭으로 정렬.
  const groups = useMemo(() => {
    const byMetric = (a: RichMember, b: RichMember) =>
      sortValue(b, sort) - sortValue(a, sort) || a.nickname.localeCompare(b.nickname);
    const of = (role: RichMember['role']) => members.filter((m) => m.role === role).sort(byMetric);
    return [
      { label: '길드장', rows: of('leader') },
      { label: '부길드장', rows: of('vice') },
      { label: '길드원', rows: of('member') },
    ];
  }, [members, sort]);

  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
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

      {/* 직책별 섹션(길드장/부길드장/길드원) — 섹션마다 테두리 박스, 내부는 divider로 유저 구분. */}
      {groups.map(({ label, rows }) =>
        rows.length === 0 ? null : (
          <div key={label} className="mt-3">
            <p className="px-1 pb-0.5 text-[10px] font-bold uppercase tracking-wide text-zinc-400">
              {label}
            </p>
            <ul>
              {rows.map((m) => (
                <MemberRow key={m.userId} m={m} myUserId={myUserId} />
              ))}
            </ul>
          </div>
        ),
      )}
    </section>
  );
}
