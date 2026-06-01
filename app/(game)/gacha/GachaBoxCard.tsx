'use client';

import { useOptimistic, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import type { Slot } from '@/lib/db/schema/equipment';

import { openAction, type OpenActionResult } from './actions';
import { GachaResultModal } from './GachaResultModal';

const SLOT_LABEL: Record<Slot, string> = {
  weapon: '무기',
  armor: '방어구',
  accessory: '장신구',
};

export function GachaBoxCard({
  slot,
  label,
  bg,
  bgPosY = '70%',
  tint,
  count,
  eager = false,
}: {
  slot: Slot;
  label: string;
  bg: string;
  bgPosY?: string;
  tint: string;
  count: number;
  eager?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<Extract<OpenActionResult, { status: 'success' }> | null>(
    null,
  );
  const [shake, setShake] = useState(false);
  // 보유 카운트 낙관 차감 — 클릭 즉시 우상단 표시 감소(서버 응답 + refresh로 sync).
  const [displayCount, setOptimisticCount] = useOptimistic(count);

  const multiN = displayCount >= 2 ? Math.min(10, displayCount) : 10;

  const pull = (n: number) => {
    if (pending || displayCount < 1) return;
    setShake(true);
    setTimeout(() => setShake(false), 360);
    startTransition(async () => {
      setOptimisticCount(Math.max(0, displayCount - n));
      const r = await openAction(slot, n);
      if (r.status === 'error') {
        alert(r.message);
        return;
      }
      setResult(r);
      router.refresh();
    });
  };

  return (
    <>
      <div
        style={{
          backgroundColor: tint,
          animation: shake ? 'gacha-box-shake 360ms ease-in-out' : undefined,
        }}
        className="relative overflow-hidden rounded-2xl border border-zinc-800"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={bg}
          alt=""
          aria-hidden
          draggable={false}
          loading={eager ? 'eager' : 'lazy'}
          fetchPriority={eager ? 'high' : 'auto'}
          decoding="async"
          className="absolute inset-0 h-full w-full object-cover opacity-90"
          style={{ imageRendering: 'pixelated', objectPosition: `50% ${bgPosY}` }}
        />
        <div className="relative bg-gradient-to-b from-black/0 via-black/45 to-black/85 px-4 py-3">
          <div className="flex items-baseline justify-between">
            <h2 className="text-base font-bold text-white drop-shadow-sm">{label}</h2>
            <span className="text-xs text-white/85">
              보유 <span className="font-mono font-semibold tabular-nums">{displayCount}</span>개
            </span>
          </div>

          {/* 두 버튼 grid-cols-2로 폭 동일 — multiN 라벨 가변에 따른 width 흔들림 방지. */}
          <div className="mt-3 ml-auto grid w-44 grid-cols-2 gap-1.5">
            <button
              type="button"
              disabled={pending || displayCount < 1}
              onClick={() => pull(1)}
              className="rounded-md bg-white/95 px-3 py-1.5 text-center text-[11px] font-semibold text-zinc-900 shadow-sm transition-transform active:scale-95 disabled:opacity-40"
            >
              1회 열기
            </button>
            <button
              type="button"
              disabled={pending || displayCount < 2}
              onClick={() => pull(multiN)}
              className="rounded-md bg-amber-500 px-3 py-1.5 text-center text-[11px] font-semibold text-white shadow-sm transition-transform active:scale-95 disabled:opacity-40"
            >
              {multiN}회 열기
            </button>
          </div>
        </div>

        {/* 클릭 시 white flash overlay */}
        {shake ? (
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-white"
            style={{ animation: 'gacha-box-flash 360ms ease-out' }}
          />
        ) : null}
      </div>

      {result ? (
        <GachaResultModal
          slot={slot}
          slotLabel={SLOT_LABEL[slot]}
          results={result.results}
          remaining={result.remaining}
          pulling={pending}
          onAgain={pull}
          onClose={() => setResult(null)}
        />
      ) : null}
    </>
  );
}
