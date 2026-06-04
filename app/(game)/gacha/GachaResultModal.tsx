'use client';

import { useEffect, useState } from 'react';

import type { Slot } from '@/lib/db/schema/equipment';
import { TranscendSprite } from '@/components/TranscendSprite';
import { RarityFrame, rarityBorderStyle, hasRarityBorder } from '@/components/RarityFrame';
import { transcendStyle } from '@/lib/game/equipment/transcend';

import type { OpenedItem } from './actions';

/**
 * 한 결과 카드 — 인벤토리 목록 카드와 동일한 디자인(rounded-xl border-2 + 등급 테두리 +
 * RarityFrame 별 장식 + frameless 스프라이트 + 이름 + ✦초월수치). 강화수치는 표기 안 함.
 *
 * 초월 연출(transcended>0): 단계마다 ① 부르르 떨림 → ② 밝은 빛을 뿜으며 ✦수치 한 단계 상승
 * + 테두리/별/색이 새 등급으로 전환(같은 색 구간이면 테두리는 그대로 — 10레벨 단위 변화).
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
  const steps = r.transcended > 0 ? r.transcended : 0;
  const fromT = Math.max(0, finalT - steps);
  const [shown, setShown] = useState(steps > 0 ? fromT : finalT);
  const [tremKey, setTremKey] = useState(0); // 떨림 트리거
  const [flashKey, setFlashKey] = useState(0); // 빛 + 단계상승 트리거

  useEffect(() => {
    if (steps <= 0) {
      setShown(finalT);
      return;
    }
    setShown(fromT);
    let cur = fromT;
    const STEP = 820; // 단계당 총 길이(ms)
    const TREM = 460; // 떨림 후 빛+상승 시점
    const timers: ReturnType<typeof setTimeout>[] = [];
    for (let i = 0; i < steps; i++) {
      const base = i * STEP;
      timers.push(setTimeout(() => setTremKey((k) => k + 1), base + 20));
      timers.push(
        setTimeout(() => {
          cur += 1;
          setShown(cur);
          setFlashKey((k) => k + 1);
        }, base + TREM),
      );
    }
    return () => timers.forEach(clearTimeout);
  }, [fromT, finalT, steps]);

  const st = transcendStyle(shown);
  const grade = `rgb(${st.colorRgb.join(',')})`;
  const spriteSize = big ? 64 : 44;

  return (
    <button
      type="button"
      onClick={onClick}
      title={r.name}
      style={{ ...rarityBorderStyle(shown), transition: 'border-color 400ms ease-out' }}
      className={`relative flex aspect-square flex-col items-center justify-center gap-0.5 overflow-hidden rounded-xl border-2 bg-white px-1 text-center dark:bg-zinc-950 ${
        hasRarityBorder(shown) ? '' : 'border-zinc-200 dark:border-zinc-800'
      }`}
    >
      <RarityFrame level={shown} />
      {/* 밝은 빛 플래시 — 단계 상승 순간 카드 전체를 덮음 */}
      {flashKey > 0 ? (
        <span
          key={`f${flashKey}`}
          aria-hidden
          className="pointer-events-none absolute inset-0 z-20"
          style={{
            background:
              'radial-gradient(circle at 50% 45%, rgba(255,255,255,0.98), rgba(255,255,255,0) 72%)',
            animation: 'gacha-transcend-flash 560ms ease-out',
          }}
        />
      ) : null}
      {r.isNew ? (
        <span className="absolute left-1 top-1 z-30 rounded bg-emerald-500 px-1 text-[8px] font-bold text-white">
          NEW
        </span>
      ) : null}
      {/* 떨림은 스프라이트에만 — 단계 직전 부르르 */}
      <span
        key={`t${tremKey}`}
        className="relative z-10 flex"
        style={tremKey > 0 ? { animation: 'gacha-transcend-tremble 460ms ease-in-out' } : undefined}
      >
        <TranscendSprite
          code={r.code}
          slot={slot}
          level={shown}
          isChampion={r.isChampion}
          size={spriteSize}
          frameless
        />
      </span>
      <span
        className={`line-clamp-2 break-keep px-0.5 leading-tight text-zinc-600 dark:text-zinc-400 ${
          big ? 'text-xs' : 'text-[9px]'
        }`}
      >
        {r.name}
      </span>
      {shown > 0 ? (
        <span
          key={`p${flashKey}`}
          className={`font-semibold tabular-nums ${big ? 'text-xs' : 'text-[9px]'}`}
          style={{
            color: grade,
            animation: flashKey > 0 ? 'gacha-transcend-pop 420ms ease-out' : undefined,
          }}
        >
          ✦{shown}
        </span>
      ) : null}
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
              <div className="w-36">
                <ResultCard r={single} slot={slot} big />
              </div>
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
