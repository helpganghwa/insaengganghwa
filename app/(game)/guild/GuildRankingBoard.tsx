'use client';

import { useState } from 'react';

import { GuildInfoModal } from './GuildInfoModal';
import { EmblemThumb, JoinPolicyBadge, fmtNum, type GuildRow } from './guild-row';

export type RankSort = 'level' | 'combat' | 'zones';

const SORTS: { key: RankSort; label: string }[] = [
  { key: 'level', label: '레벨' },
  { key: 'combat', label: '전투력' },
  { key: 'zones', label: '점령지' },
];

/** 1~3위 메달색 — 순위 화면인데 순위가 회색 숫자로만 보이던 문제(2026-07-30). */
const MEDAL: Record<number, string> = {
  1: 'bg-gradient-to-b from-amber-300 to-amber-500 text-amber-950 ring-amber-200/60',
  2: 'bg-gradient-to-b from-zinc-200 to-zinc-400 text-zinc-800 ring-zinc-200/60',
  3: 'bg-gradient-to-b from-orange-300 to-orange-500 text-orange-950 ring-orange-200/60',
};

/**
 * 길드 랭킹(R-1 확정안) — 내 길드 고정 + 메달.
 *
 * 정렬은 **서버가 3지표 순위를 이미 확정해서** 내려준 것을 고르기만 한다(왕복 없음).
 * 클라가 top-N 안에서 재정렬하면 전 서버 순위가 아니게 되므로 그 방식은 쓰지 않는다
 * (2026-07-30 사용자 지적). myRank도 top-N 밖의 진짜 순위다.
 */
export function GuildRankingBoard({
  lists,
  myRank,
  myRow,
  myGuildId,
  onJoin,
  pending,
  myRequestGuildId,
  emptyText,
}: {
  lists: Record<RankSort, GuildRow[]>;
  /** 지표별 내 길드 전 서버 순위. 무소속이면 전부 null. */
  myRank?: Record<RankSort, number | null>;
  myRow?: GuildRow | null;
  myGuildId?: string | null;
  /** 미가입자 화면에서만 — 행에 가입 버튼을 붙인다. */
  onJoin?: (id: string) => void;
  pending?: boolean;
  myRequestGuildId?: string | null;
  emptyText?: string;
}) {
  const [sort, setSort] = useState<RankSort>('level');
  const [selected, setSelected] = useState<GuildRow | null>(null);
  const rows = lists[sort];
  const rank = myRank?.[sort] ?? null;
  // 상위 목록에 이미 내가 있으면 고정 카드는 중복 — 밖일 때만 붙인다.
  const pinned = myRow && rank != null && rank > rows.length ? myRow : null;

  return (
    <>
      <div className="flex justify-end">
        <div className="flex gap-1 rounded-lg bg-zinc-100 p-0.5 dark:bg-zinc-900">
          {SORTS.map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => setSort(s.key)}
              className={`rounded-md px-2.5 py-1 text-[11px] font-bold transition ${
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

      {/* 내 길드 고정 — 순위가 아래로 밀려도 "우리 몇 위지?"에 스크롤 없이 답한다. */}
      {pinned && rank != null ? (
        <div className="mt-2.5">
          <RankRow g={pinned} rank={rank} sort={sort} mine onOpen={() => setSelected(pinned)} />
          <p className="mt-1 text-center text-[10px] text-zinc-400">우리 길드</p>
        </div>
      ) : null}

      {rows.length === 0 ? (
        <p className="mt-3 rounded-lg border border-dashed border-zinc-300 px-3 py-6 text-center text-xs text-zinc-500 dark:border-zinc-700">
          {emptyText ?? '아직 결성된 길드가 없습니다.'}
        </p>
      ) : (
        <ul className="mt-2.5 space-y-1.5">
          {rows.map((g, i) => (
            <li key={g.id} className="flex items-center gap-2">
              <RankRow
                g={g}
                rank={i + 1}
                sort={sort}
                mine={g.id === myGuildId}
                onOpen={() => setSelected(g)}
              />
              {onJoin ? (
                g.id === myRequestGuildId ? (
                  <span className="shrink-0 rounded-full bg-zinc-100 px-2.5 py-1.5 text-[11px] font-bold text-zinc-400 dark:bg-zinc-800">
                    신청됨
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => onJoin(g.id)}
                    disabled={pending}
                    className="shrink-0 rounded-full bg-amber-600 px-2.5 py-1.5 text-[11px] font-bold text-white disabled:opacity-50"
                  >
                    {g.joinPolicy === 'open' ? '가입' : '신청'}
                  </button>
                )
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {selected && <GuildInfoModal guild={selected} onClose={() => setSelected(null)} />}
    </>
  );
}

/** 랭킹 행 — 지표에 따라 오른쪽 큰 수치가 바뀐다(무엇으로 줄 세웠는지 한눈에). */
function RankRow({
  g,
  rank,
  sort,
  mine,
  onOpen,
}: {
  g: GuildRow;
  rank: number;
  sort: RankSort;
  mine?: boolean;
  onOpen: () => void;
}) {
  const medal = MEDAL[rank];
  const metric =
    sort === 'level'
      ? { label: '레벨', value: `Lv.${g.level}` }
      : sort === 'zones'
        ? { label: '점령지', value: `${g.zones.length}` }
        : { label: '전투력', value: fmtNum(g.combat) };
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`flex min-w-0 flex-1 items-center gap-2.5 rounded-xl border px-2.5 py-2 text-left transition active:opacity-70 ${
        mine
          ? 'border-amber-400 bg-amber-50/70 dark:border-amber-500/50 dark:bg-amber-500/10'
          : 'border-zinc-200 dark:border-zinc-800'
      }`}
    >
      <span
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[13px] font-extrabold tabular-nums ${
          medal
            ? `${medal} ring-1`
            : 'bg-zinc-100 text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400'
        }`}
      >
        {rank}
      </span>
      <EmblemThumb url={g.emblemUrl} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-[13px] font-bold">{g.name}</span>
          <JoinPolicyBadge policy={g.joinPolicy} />
        </div>
        <div className="mt-0.5 truncate text-[10.5px] text-zinc-500">
          Lv.{g.level} · {g.memberCount}명 · 점령 {g.zones.length}
          {g.leaderNickname ? ` · 길드장 ${g.leaderNickname}` : ''}
        </div>
      </div>
      <div className="shrink-0 text-right">
        <div className="text-[9px] leading-none text-zinc-400">{metric.label}</div>
        <div className="mt-0.5 text-[13px] font-bold tabular-nums text-amber-600 dark:text-amber-400">
          {metric.value}
        </div>
      </div>
    </button>
  );
}
