'use client';

import { useEffect, useState } from 'react';

import type { Slot } from '@/lib/db/schema/equipment';
import { TranscendSprite } from '@/components/TranscendSprite';
import { transcendStyle } from '@/lib/game/equipment/transcend';

import type { OpenedItem } from './actions';

/**
 * 한 결과 카드 — 현재 초월 등급 색 테두리. 이번 열기로 초월이 올랐으면(transcended>0)
 * ✦단계가 강화처럼 한 단계씩 올라가는 애니메이션(색도 등급색으로 전환).
 */
function ResultCard({
  r,
  slot,
  big,
  onClick,
}: {
  r: OpenedItem;
  slot: Slot;
  big?: boolean;
  onClick?: () => void;
}) {
  const finalT = r.transcendLevel;
  const fromT = r.transcended > 0 ? Math.max(0, finalT - r.transcended) : finalT;
  const [shown, setShown] = useState(fromT);
  const [pop, setPop] = useState(0);

  useEffect(() => {
    if (r.transcended <= 0) {
      setShown(finalT);
      return;
    }
    let cur = fromT;
    setShown(fromT);
    let t: ReturnType<typeof setTimeout>;
    const run = () => {
      cur += 1;
      setShown(cur);
      setPop((p) => p + 1);
      if (cur < finalT) t = setTimeout(run, 520);
    };
    t = setTimeout(run, 350);
    return () => clearTimeout(t);
  }, [fromT, finalT, r.transcended]);

  const [cr, cg, cb] = transcendStyle(shown).colorRgb;
  const grade = `rgb(${cr},${cg},${cb})`;

  return (
    <button
      type="button"
      onClick={onClick}
      title={r.name}
      className={`relative flex flex-col items-center text-center ${
        big ? 'rounded-xl p-4' : 'aspect-square justify-center rounded-lg p-1'
      } border-2`}
      style={{ borderColor: grade, transition: 'border-color 450ms ease-out' }}
    >
      {r.isNew ? (
        <span className="absolute left-1 top-1 z-10 rounded bg-emerald-500 px-1 text-[8px] font-bold text-white">
          NEW
        </span>
      ) : null}
      {finalT > 0 ? (
        <span
          key={pop}
          className="absolute right-1 top-1 z-10 text-[10px] font-extrabold tabular-nums drop-shadow-[0_1px_2px_rgba(0,0,0,0.6)]"
          style={{ color: grade, animation: r.transcended > 0 ? 'gacha-transcend-pop 420ms ease-out' : undefined }}
        >
          ✦{shown}
        </span>
      ) : null}
      <TranscendSprite
        code={r.code}
        slot={slot}
        level={shown}
        isChampion={r.isChampion}
        size={big ? 64 : 36}
        frameless
      />
      <span
        className={
          big
            ? 'mt-1 break-keep text-base font-semibold'
            : 'line-clamp-2 break-keep px-0.5 text-[9px] leading-tight text-zinc-600 dark:text-zinc-400'
        }
      >
        {r.name}
      </span>
    </button>
  );
}

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
  // 신규 → 초월 우선 정렬.
  const sortedResults = results
    .slice()
    .sort((a, b) => Number(b.isNew) - Number(a.isNew) || b.transcended - a.transcended);
  const single = results.length === 1 ? results[0]! : null;
  const multiN = remaining >= 2 ? Math.min(10, remaining) : 10;
  const [openLoreIdx, setOpenLoreIdx] = useState<number | null>(null);
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
            <div className="flex flex-col items-center text-center">
              <ResultCard r={single} slot={slot} big />
              {single.isNew && single.loreTeaser ? (
                <div className="mt-3 w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3.5 py-3 text-left dark:border-zinc-800 dark:bg-zinc-900">
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
              <p className="text-sm font-medium">{results.length}회 열기</p>
              <div className="mt-3 grid grid-cols-4 gap-2">
                {sortedResults.map((r, i) => (
                  <ResultCard
                    key={i}
                    r={r}
                    slot={slot}
                    onClick={() => {
                      if (!r.isNew) return;
                      setOpenLoreIdx(openLoreIdx === i ? null : i);
                    }}
                  />
                ))}
              </div>
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
            한 번 더
          </button>
          <button
            type="button"
            disabled={pulling || remaining < 2}
            onClick={() => onAgain(multiN)}
            className="rounded-full bg-gradient-to-r from-amber-500 to-orange-500 px-3 py-2.5 text-xs font-medium text-white disabled:opacity-40"
          >
            {multiN}회 더
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
