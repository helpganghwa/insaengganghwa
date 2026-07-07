'use client';

import { useState } from 'react';

import { ModalShell } from '@/components/ModalShell';
import { REGION_META, type Region } from '@/lib/game/guild/region-meta';

export type GuildRow = {
  id: string;
  name: string;
  level: number;
  memberCount: number;
  emblemUrl: string | null;
  emblemColor: string | null;
  combat: number;
  intro: string | null;
  /** 가입 방식 — 'open'(자유) | 'approval'(승인). */
  joinPolicy: string;
  /** 점령 구역 목록(없으면 빈 배열). 카드 배지 수 + 팝업 칩(지역색). */
  zones: { name: string; region: Region }[];
};

/** 컴팩트 수치(예: 53,000 → 5.3만). */
function fmtNum(n: number): string {
  return new Intl.NumberFormat('ko-KR', { notation: 'compact', maximumFractionDigits: 1 }).format(n);
}

/** 가입 방식 배지 — 자유(초록)=신청 즉시 가입 / 승인(주황)=길드장 승인 필요. */
function JoinPolicyBadge({ policy }: { policy: string }) {
  const open = policy === 'open';
  return (
    <span
      className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold leading-none ${
        open
          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300'
          : 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300'
      }`}
    >
      {open ? '자유' : '승인'}
    </span>
  );
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
              <div className="flex items-center gap-1.5">
                <span className="truncate text-sm font-semibold">{g.name}</span>
                <JoinPolicyBadge policy={g.joinPolicy} />
              </div>
              <div className="text-[11px] text-zinc-500">
                Lv.{g.level} · {g.memberCount}명
                {g.zones.length > 0 ? ` · 점령 ${g.zones.length}` : ''}
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
              <div className="flex items-center gap-1.5">
                <h2 className="truncate text-base font-bold">{selected.name}</h2>
                <JoinPolicyBadge policy={selected.joinPolicy} />
              </div>
              <p className="mt-0.5 text-[11px] text-zinc-500">
                Lv.{selected.level} · {selected.memberCount}명 · 전투력{' '}
                <span className="font-bold text-amber-600 dark:text-amber-400">{fmtNum(selected.combat)}</span>
              </p>
            </div>
          </div>
          <div className="mt-3 border-t border-zinc-100 pt-3 dark:border-zinc-900">
            <p className="text-[11px] font-bold text-zinc-400">점령 구역 ({selected.zones.length})</p>
            {selected.zones.length > 0 ? (
              <div className="mt-1.5 flex flex-wrap gap-1">
                {selected.zones.map((z) => (
                  <span
                    key={z.name}
                    className={`rounded-md px-2 py-0.5 text-[11px] font-medium ${REGION_META[z.region].chip}`}
                  >
                    {z.name}
                  </span>
                ))}
              </div>
            ) : (
              <p className="mt-1 text-[12px] text-zinc-400">점령 중인 구역이 없습니다.</p>
            )}
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
