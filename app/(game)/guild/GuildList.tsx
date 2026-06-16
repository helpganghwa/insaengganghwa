'use client';

import { useState } from 'react';

import { ModalShell } from '@/components/ModalShell';

export type GuildRow = {
  id: string;
  name: string;
  level: number;
  memberCount: number;
  emblemUrl: string | null;
  emblemColor: string | null;
  combat: number;
  intro: string | null;
};

/** 컴팩트 수치(예: 53,000 → 5.3만). */
function fmtNum(n: number): string {
  return new Intl.NumberFormat('ko-KR', { notation: 'compact', maximumFractionDigits: 1 }).format(n);
}

export function EmblemThumb({ url }: { url: string | null }) {
  return (
    <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg">
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" aria-hidden className="h-full w-full object-contain" style={{ imageRendering: 'pixelated' }} />
      ) : null}
    </div>
  );
}

/** 길드 행 리스트 — 랭킹/검색/홈 랭킹탭 공용. onJoin 있으면 가입/신청 버튼 노출. */
export function GuildList({
  guilds,
  showRank,
  onJoin,
  pending,
  myRequestGuildId,
  emptyText,
}: {
  guilds: GuildRow[];
  showRank?: boolean;
  onJoin?: (id: string) => void;
  pending?: boolean;
  myRequestGuildId?: string | null;
  emptyText?: string;
}) {
  // 길드 클릭 시 정보·소개 팝업.
  const [selected, setSelected] = useState<GuildRow | null>(null);
  if (guilds.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-zinc-300 px-3 py-6 text-center text-xs text-zinc-500 dark:border-zinc-700">
        {emptyText ?? '길드가 없습니다.'}
      </p>
    );
  }
  return (
    <>
    <ul className="space-y-2">
      {guilds.map((g, i) => (
        <li
          key={g.id}
          className="flex items-center gap-2.5 rounded-lg border border-zinc-200 px-3 py-2 dark:border-zinc-800"
        >
          {showRank && (
            <span className="w-5 shrink-0 text-center text-xs font-bold tabular-nums text-zinc-400">
              {i + 1}
            </span>
          )}
          {/* 정보 영역 클릭 → 길드 정보·소개 팝업(가입 버튼은 형제라 별개 동작) */}
          <button
            type="button"
            onClick={() => setSelected(g)}
            className="flex min-w-0 flex-1 items-center gap-2.5 text-left active:opacity-70"
          >
            <EmblemThumb url={g.emblemUrl} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold">{g.name}</div>
              <div className="text-[11px] text-zinc-500">
                Lv.{g.level} · {g.memberCount}명
              </div>
            </div>
            {/* 전투력(길드원 전투력 합) */}
            <div className="shrink-0 text-right">
              <div className="text-[9px] leading-none text-zinc-400">전투력</div>
              <div className="mt-0.5 text-[13px] font-bold tabular-nums text-amber-600 dark:text-amber-400">
                {fmtNum(g.combat)}
              </div>
            </div>
          </button>
          {onJoin &&
            (g.id === myRequestGuildId ? (
              <span className="shrink-0 rounded-full bg-zinc-100 px-3 py-1.5 text-[11px] font-bold text-zinc-400 dark:bg-zinc-800">
                신청됨
              </span>
            ) : (
              <button
                type="button"
                onClick={() => onJoin(g.id)}
                disabled={pending}
                className="shrink-0 rounded-full bg-amber-600 px-3 py-1.5 text-[11px] font-bold text-white disabled:opacity-50"
              >
                가입
              </button>
            ))}
        </li>
      ))}
    </ul>

      {/* 길드 정보·소개 팝업 */}
      {selected && (
        <ModalShell
          onClose={() => setSelected(null)}
          label={`${selected.name} 길드 정보`}
          className="w-full max-w-[320px] rounded-2xl bg-white p-4 dark:bg-zinc-950"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl">
              {selected.emblemUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={selected.emblemUrl}
                  alt=""
                  aria-hidden
                  className="h-full w-full object-contain"
                  style={{ imageRendering: 'pixelated' }}
                />
              ) : (
                <span className="text-2xl">🛡️</span>
              )}
            </div>
            <div className="min-w-0">
              <h2 className="truncate text-base font-bold">{selected.name}</h2>
              <p className="mt-0.5 text-[11px] text-zinc-500">
                Lv.{selected.level} · {selected.memberCount}명 · 전투력{' '}
                <span className="font-bold text-amber-600 dark:text-amber-400">{fmtNum(selected.combat)}</span>
              </p>
            </div>
          </div>
          <div className="mt-3 border-t border-zinc-100 pt-3 dark:border-zinc-900">
            <p className="text-[11px] font-bold text-zinc-400">길드 소개</p>
            <p className="mt-1 whitespace-pre-wrap break-words text-[13px] leading-relaxed text-zinc-600 dark:text-zinc-300">
              {selected.intro?.trim() ? selected.intro : '등록된 소개가 없습니다.'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setSelected(null)}
            className="mt-4 w-full rounded-lg bg-zinc-100 py-2.5 text-sm font-bold text-zinc-700 active:opacity-70 dark:bg-zinc-800 dark:text-zinc-200"
          >
            닫기
          </button>
        </ModalShell>
      )}
    </>
  );
}
