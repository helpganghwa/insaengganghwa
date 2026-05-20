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
  tint,
  count,
}: {
  slot: Slot;
  label: string;
  bg: string;
  tint: string;
  count: number;
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

  const watchAd = () => {
    // TODO: AdMob 통합. 초안 — placeholder.
    alert('광고 기능 준비 중입니다 — 시청하면 1회 무료 개봉이 진행됩니다.');
  };

  return (
    <>
      <div
        style={{ backgroundColor: tint }}
        className="relative overflow-hidden rounded-2xl border border-zinc-800"
      >
        {/* Pixellab 배경 — 픽셀아트 raw img + imageRendering pixelated.
            object-position '50% 70%' : 박스가 원본 이미지 하단 1/3 즈음 위치 →
            이미지의 70% 지점을 카드 중앙에 맞춰 박스를 카드 시각 중앙으로 끌어올림. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={bg}
          alt=""
          aria-hidden
          draggable={false}
          className="absolute inset-0 h-full w-full object-cover opacity-90"
          style={{ imageRendering: 'pixelated', objectPosition: '50% 70%' }}
        />
        {/* 가독성 확보용 그라데이션(상자 배경 위) */}
        <div className="relative bg-gradient-to-b from-black/0 via-black/45 to-black/85 p-4">
          <div className="flex items-baseline justify-between">
            <h2 className="text-base font-bold text-white drop-shadow-sm">{label}</h2>
            <span className="text-xs text-white/80">
              보유 <span className="font-mono font-semibold tabular-nums">{count}</span>개
            </span>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-1.5">
            <button
              type="button"
              disabled={pending || count < 1}
              onClick={() => pull(1)}
              className="rounded-full bg-white/90 px-3 py-2.5 text-xs font-semibold text-zinc-900 disabled:opacity-40"
            >
              {pending ? '여는 중…' : '1회 개봉'}
            </button>
            <button
              type="button"
              disabled={pending || count < 10}
              onClick={() => pull(10)}
              className="rounded-full bg-gradient-to-r from-amber-500 to-orange-500 px-3 py-2.5 text-xs font-semibold text-white disabled:opacity-40"
            >
              {pending ? '…' : '10회 개봉'}
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={watchAd}
              className="rounded-full border border-emerald-400/60 bg-emerald-500/20 px-3 py-2.5 text-xs font-semibold text-emerald-100 disabled:opacity-40"
            >
              📺 광고 1회
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
