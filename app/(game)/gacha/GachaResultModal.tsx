'use client';

import { useEffect, useState } from 'react';

import type { Slot } from '@/lib/db/schema/equipment';
import { TranscendSprite } from '@/components/TranscendSprite';

import type { OpenedItem } from './actions';

export function GachaResultModal({
  slot,
  slotLabel,
  results,
  remaining,
  pulling,
  onAgain,
  onClose,
}: {
  slot: Slot;
  slotLabel: string;
  results: OpenedItem[];
  remaining: number;
  pulling: boolean;
  onAgain: (n: number) => void;
  onClose: () => void;
}) {
  // 다중 결과 — 신규 우선 정렬.
  const sortedResults = results.slice().sort((a, b) => Number(b.isNew) - Number(a.isNew));
  const newCount = results.filter((r) => r.isNew).length;
  const dupCount = results.length - newCount;
  const single = results.length === 1 ? results[0]! : null;
  const multiN = remaining >= 2 ? Math.min(10, remaining) : 10;
  // 다중 결과의 신규 카드 탭 시 인라인 로어 펼침.
  const [openLoreIdx, setOpenLoreIdx] = useState<number | null>(null);
  // 연속 열기(onAgain) 시 결과 영역 페이드 — results 변경 시 재트리거.
  const [resultKey, setResultKey] = useState(0);
  useEffect(() => {
    setResultKey((k) => k + 1);
    setOpenLoreIdx(null);
  }, [results]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="보급 결과"
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4 backdrop-blur-md"
    >
      <div
        className="max-h-[88dvh] w-full max-w-[360px] overflow-y-auto rounded-2xl bg-white p-4 shadow-[0_0_40px_rgba(245,158,11,0.18)] ring-1 ring-amber-700/40 dark:bg-zinc-950"
        style={{ animation: 'gacha-result-in 220ms ease-out' }}
      >
        <div key={resultKey} style={{ animation: 'gacha-result-swap 240ms ease-out' }}>
          {single ? (
            <div className="text-center">
              <p className="text-sm font-medium">
                {single.isNew ? (
                  <span className="text-emerald-600 dark:text-emerald-400">신규 해금!</span>
                ) : (
                  <span className="text-zinc-500">획득!</span>
                )}
              </p>
              <div
                className="mt-2 flex flex-col items-center rounded-xl border-2 p-4 dark:border-zinc-800"
                style={
                  single.isNew
                    ? {
                        borderColor: 'rgb(16,185,129)',
                        animation: 'gacha-new-glow 1.6s ease-in-out 1',
                      }
                    : { borderColor: undefined }
                }
              >
                <TranscendSprite
                  code={single.code}
                  slot={slot}
                  level={0}
                  isChampion={single.isChampion}
                  size={64}
                  frameless
                />
                <div className="mt-1 text-base font-semibold">{single.name}</div>
              </div>
              {single.isNew && single.loreTeaser ? (
                <div className="mt-3 rounded-xl border border-zinc-200 bg-zinc-50 px-3.5 py-3 text-left dark:border-zinc-800 dark:bg-zinc-900">
                  <div className="mb-1 text-[10px] font-semibold tracking-wide text-zinc-400">
                    📖 이야기
                  </div>
                  <p className="text-[12px] leading-relaxed text-zinc-600 dark:text-zinc-300">
                    {single.loreTeaser}
                  </p>
                </div>
              ) : null}
            </div>
          ) : (
            <>
              <p className="flex items-baseline justify-between text-sm">
                <span className="font-medium">{results.length}회 열기</span>
                <span className="text-[11px] text-zinc-500">
                  신규 <span className="font-semibold text-emerald-600">{newCount}</span> · 중복{' '}
                  <span className="font-semibold text-zinc-700 dark:text-zinc-300">{dupCount}</span>
                </span>
              </p>
              <div className="mt-3 grid grid-cols-4 gap-2">
                {sortedResults.map((r, i) => {
                  const isOpen = openLoreIdx === i;
                  return (
                    <button
                      type="button"
                      key={i}
                      onClick={() => {
                        if (!r.isNew) return;
                        setOpenLoreIdx(isOpen ? null : i);
                      }}
                      className="relative flex aspect-square flex-col items-center justify-center rounded-lg border-2 p-1 text-center"
                      style={
                        r.isNew
                          ? { borderColor: 'rgb(16,185,129)' }
                          : { borderColor: undefined }
                      }
                      title={r.name}
                    >
                      <TranscendSprite
                        code={r.code}
                        slot={slot}
                        level={0}
                        isChampion={r.isChampion}
                        size={36}
                        frameless
                      />
                      <span className="line-clamp-2 break-keep px-0.5 text-[9px] leading-tight text-zinc-600 dark:text-zinc-400">
                        {r.name}
                      </span>
                    </button>
                  );
                })}
              </div>
              {/* 신규 카드 탭 시 로어 펼침 */}
              {openLoreIdx !== null && sortedResults[openLoreIdx]?.loreTeaser ? (
                <div className="mt-3 rounded-xl border border-emerald-300 bg-emerald-50 px-3.5 py-3 text-left dark:border-emerald-800 dark:bg-emerald-950/30">
                  <div className="mb-1 text-[10px] font-semibold tracking-wide text-emerald-700 dark:text-emerald-300">
                    📖 {sortedResults[openLoreIdx]!.name}
                  </div>
                  <p className="text-[12px] leading-relaxed text-zinc-700 dark:text-zinc-200">
                    {sortedResults[openLoreIdx]!.loreTeaser}
                  </p>
                </div>
              ) : null}
            </>
          )}
        </div>

        <p className="mt-3 text-center text-[11px] text-zinc-500">
          남은 {slotLabel} 상자 {remaining}개
        </p>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            type="button"
            disabled={pulling || remaining < 1}
            onClick={() => onAgain(1)}
            className="rounded-full bg-zinc-100 px-3 py-2.5 text-xs font-medium disabled:opacity-40 dark:bg-zinc-900"
          >
            {pulling ? '여는 중…' : '한 번 더'}
          </button>
          <button
            type="button"
            disabled={pulling || remaining < 2}
            onClick={() => onAgain(multiN)}
            className="rounded-full bg-gradient-to-r from-amber-500 to-orange-500 px-3 py-2.5 text-xs font-medium text-white disabled:opacity-40"
          >
            {pulling ? '…' : `${multiN}회 더`}
          </button>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="mt-2 w-full rounded-full bg-zinc-900 px-3 py-2.5 text-xs font-medium text-white dark:bg-zinc-50 dark:text-zinc-950"
        >
          확인
        </button>
      </div>
    </div>
  );
}
