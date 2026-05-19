'use client';

import Link from 'next/link';

import type { Slot } from '@/lib/db/schema/equipment';
import { TranscendSprite } from '@/components/TranscendSprite';

import type { OpenedItem } from './actions';

export function GachaResultModal({
  slot,
  results,
  remaining,
  gemTotal,
  pulling,
  onAgain,
  onClose,
}: {
  slot: Slot;
  results: OpenedItem[];
  remaining: number;
  gemTotal: number;
  pulling: boolean;
  onAgain: (n: 1 | 10) => void;
  onClose: () => void;
}) {
  const newCount = results.filter((r) => r.isNew).length;
  const dupCount = results.length - newCount;
  const single = results.length === 1 ? results[0]! : null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="보급 결과"
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 p-4 sm:items-center"
    >
      <div className="max-h-[88dvh] w-full max-w-[360px] overflow-y-auto rounded-2xl bg-white p-4 dark:bg-zinc-950">
        {single ? (
          <div className="text-center">
            <p className="text-sm font-medium">
              {single.isNew ? (
                <span className="text-emerald-600 dark:text-emerald-400">🆕 신규 해금!</span>
              ) : (
                <span className="text-zinc-500">획득!</span>
              )}
            </p>
            <div className="mt-2 flex flex-col items-center rounded-xl border-2 border-zinc-200 p-4 dark:border-zinc-800">
              <TranscendSprite
                code={single.code}
                slot={slot}
                level={0}
                isChampion={single.isChampion}
                size={64}
              />
              <div className="mt-1 text-base font-semibold">
                {single.isChampion ? '👑 ' : ''}
                {single.name}
              </div>
              <div className="mt-0.5 text-[11px] text-zinc-500">+0</div>
              {!single.isNew ? (
                <div className="mt-1 text-[11px] text-amber-600 dark:text-amber-400">
                  중복 — 초월/+100 제물로 활용
                </div>
              ) : null}
            </div>
            {single.isNew && single.loreTeaser ? (
              <div className="mt-3 rounded-xl border border-zinc-200 bg-zinc-50 px-3.5 py-3 text-left dark:border-zinc-800 dark:bg-zinc-900">
                <div className="mb-1 text-[10px] font-semibold tracking-wide text-zinc-400">
                  📖 이야기
                </div>
                <p className="text-[12px] leading-relaxed text-zinc-600 dark:text-zinc-300">
                  {single.loreTeaser}
                </p>
                <Link
                  href={`/me/codex/${single.catalogItemId}`}
                  className="mt-1.5 inline-block text-[11px] font-medium text-amber-600 dark:text-amber-400"
                >
                  도감에서 전체 이야기 ›
                </Link>
              </div>
            ) : null}
          </div>
        ) : (
          <>
            <p className="text-center text-sm font-medium">
              {results.length}회 개봉 — <span className="text-emerald-600">신규 {newCount}</span> ·{' '}
              <span className="text-zinc-500">중복 {dupCount}</span>
            </p>
            <div className="mt-3 grid grid-cols-4 gap-2">
              {results.map((r, i) => (
                <div
                  key={i}
                  className="relative flex aspect-square flex-col items-center justify-center rounded-lg border-2 border-zinc-200 p-1 text-center dark:border-zinc-800"
                  title={r.name}
                >
                  {r.isNew ? (
                    <span className="absolute left-1 top-1 rounded-full bg-emerald-500 px-1 text-[8px] font-bold text-white">
                      N
                    </span>
                  ) : null}
                  {r.isChampion ? (
                    <span className="absolute right-1 top-1 text-[10px]">👑</span>
                  ) : null}
                  <TranscendSprite
                    code={r.code}
                    slot={slot}
                    level={0}
                    isChampion={r.isChampion}
                    size={36}
                  />
                  <span className="line-clamp-1 px-0.5 text-[9px] text-zinc-600 dark:text-zinc-400">
                    {r.name}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}

        <p className="mt-3 text-center text-[11px] text-zinc-500">
          {gemTotal > 0 ? (
            <span className="font-medium text-cyan-600 dark:text-cyan-400">
              💎 +{gemTotal} 보너스 ·{' '}
            </span>
          ) : null}
          남은 상자 {remaining}개
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
            disabled={pulling || remaining < 10}
            onClick={() => onAgain(10)}
            className="rounded-full bg-gradient-to-r from-amber-500 to-orange-500 px-3 py-2.5 text-xs font-medium text-white disabled:opacity-40"
          >
            {pulling ? '…' : '10회 더'}
          </button>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <Link
            href="/inventory"
            className="rounded-full border border-zinc-300 px-3 py-2.5 text-center text-xs dark:border-zinc-700"
          >
            🎒 인벤토리
          </Link>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full bg-zinc-900 px-3 py-2.5 text-xs font-medium text-white dark:bg-zinc-50 dark:text-zinc-950"
          >
            확인
          </button>
        </div>
      </div>
    </div>
  );
}
