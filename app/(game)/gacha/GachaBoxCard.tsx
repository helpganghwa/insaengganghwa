'use client';

import { useState, useTransition } from 'react';
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

  const multiN = count >= 2 ? Math.min(10, count) : 10;
  const empty = count <= 0;

  const pull = (n: number) => {
    if (pending || count < 1) return;
    setShake(true);
    setTimeout(() => setShake(false), 360);
    startTransition(async () => {
      const r = await openAction(slot, n);
      if (r.status === 'error') {
        alert(r.message);
        return;
      }
      setResult(r);
      router.refresh();
    });
  };

  // 카드 전체 클릭 = 멀티 열기(기본). 1회는 작은 우측 칩.
  const onCardClick = () => {
    if (empty) return;
    pull(multiN);
  };

  return (
    <>
      <div
        style={{
          backgroundColor: tint,
          animation: shake ? 'gacha-box-shake 360ms ease-in-out' : undefined,
        }}
        className={`relative overflow-hidden rounded-2xl border border-zinc-800 transition active:scale-[0.99] ${
          empty ? 'opacity-55' : 'cursor-pointer'
        }`}
        onClick={onCardClick}
        role="button"
        tabIndex={empty ? -1 : 0}
        aria-disabled={empty}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onCardClick();
          }
        }}
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
              보유 <span className="font-mono font-semibold tabular-nums">{count}</span>개
            </span>
          </div>

          {empty ? (
            <p className="mt-3 text-[11px] leading-relaxed text-white/75">
              상자가 없어요 — <span className="font-semibold text-amber-300">우편함</span>·
              <span className="font-semibold text-amber-300">출석</span>·
              <span className="font-semibold text-amber-300">친구 초대</span>로 받을 수 있어요.
            </p>
          ) : (
            <div className="mt-3 flex justify-end gap-1.5">
              <button
                type="button"
                disabled={pending}
                onClick={(e) => {
                  e.stopPropagation();
                  pull(1);
                }}
                className="rounded-md bg-white/95 px-3 py-1.5 text-[11px] font-semibold text-zinc-900 shadow-sm transition-transform active:scale-95 disabled:opacity-40"
              >
                {pending ? '여는 중…' : '1회'}
              </button>
              <button
                type="button"
                disabled={pending || count < 2}
                onClick={(e) => {
                  e.stopPropagation();
                  pull(multiN);
                }}
                className="rounded-md bg-amber-500 px-3 py-1.5 text-[11px] font-semibold text-white shadow-sm transition-transform active:scale-95 disabled:opacity-40"
              >
                {pending ? '여는 중…' : `${multiN}회 열기`}
              </button>
            </div>
          )}
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
