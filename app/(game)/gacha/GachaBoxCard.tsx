'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import type { Slot } from '@/lib/db/schema/equipment';

import { openAction, type OpenActionResult } from './actions';
import { GachaResultModal } from './GachaResultModal';

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
  /** 배경 이미지의 세로 정렬 — 박스 모티프의 y가 이미지 어디쯤인지 슬롯별 조정. */
  bgPosY?: string;
  tint: string;
  count: number;
  /** 화면 최상단(LCP)에 노출되는 첫 카드만 true → eager + fetchpriority high. */
  eager?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<Extract<OpenActionResult, { status: 'success' }> | null>(
    null,
  );

  const pull = (n: 1 | 10) => {
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

  return (
    <>
      <div
        style={{ backgroundColor: tint }}
        className="relative overflow-hidden rounded-2xl border border-zinc-800"
      >
        {/* Pixellab 배경 — 픽셀아트 raw img + imageRendering pixelated.
            object-position '50% 70%' : 박스가 원본 이미지 하단 1/3 즈음 위치 →
            이미지의 70% 지점을 카드 중앙에 맞춰 박스를 카드 시각 중앙으로 끌어올림.
            첫 카드(eager=true)는 LCP 자산 → fetchpriority high + eager 로드. */}
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
        {/* 가독성 확보용 그라데이션(상자 배경 위) */}
        <div className="relative bg-gradient-to-b from-black/0 via-black/45 to-black/85 p-4">
          <div className="flex items-baseline justify-between">
            <h2 className="text-base font-bold text-white drop-shadow-sm">{label}</h2>
            <span className="text-xs text-white/80">
              보유 <span className="font-mono font-semibold tabular-nums">{count}</span>개
            </span>
          </div>
          {/* 우측 아래로 버튼 몰아 배경 시각 보존(사용자 결정). 1회·10회 모두 작은 칩 스타일. */}
          <div className="mt-4 flex justify-end gap-1.5">
            <button
              type="button"
              disabled={pending || count < 1}
              onClick={() => pull(1)}
              className="rounded-full border border-white/40 bg-white/95 px-3 py-1.5 text-[11px] font-bold text-zinc-900 shadow-md ring-1 ring-white/10 transition-transform active:scale-95 disabled:opacity-40"
            >
              {pending ? '여는 중…' : '1회 열기'}
            </button>
            <button
              type="button"
              disabled={pending || count < 10}
              onClick={() => pull(10)}
              className="rounded-full bg-gradient-to-r from-amber-400 via-orange-500 to-red-500 px-3 py-1.5 text-[11px] font-bold text-white shadow-lg ring-1 ring-amber-300/50 transition-transform active:scale-95 disabled:opacity-40"
            >
              {pending ? '여는 중…' : '10회 열기'}
            </button>
          </div>
        </div>
      </div>

      {result ? (
        <GachaResultModal
          slot={slot}
          results={result.results}
          remaining={result.remaining}
          gemTotal={result.gemTotal}
          pulling={pending}
          onAgain={pull}
          onClose={() => setResult(null)}
        />
      ) : null}
    </>
  );
}
