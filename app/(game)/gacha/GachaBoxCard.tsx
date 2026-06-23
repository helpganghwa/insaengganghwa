'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import type { Slot } from '@/lib/db/schema/equipment';

import { useResourceToast } from '@/components/ResourceToast';
import { sounds } from '@/lib/game/sound';

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
  const { showError } = useResourceToast();
  const [result, setResult] = useState<Extract<OpenActionResult, { status: 'success' }> | null>(
    null,
  );
  const [shake, setShake] = useState(false);
  // 로딩 상태는 **개봉 액션 자체**에만 묶는다(router.refresh를 transition에 넣으면
  // 콜드 RSC 새로고침이 느리거나 멈출 때 pending이 안 풀려 버튼이 영구 disabled → 뽑기 불가).
  const [drawing, setDrawing] = useState(false);
  // 보유 카운트 — 낙관 차감/서버 잔여를 optimistic에 담고, 미설정이면 count prop(서버 새로고침값) 사용.
  const [optimistic, setOptimistic] = useState<number | null>(null);
  const displayCount = optimistic ?? count;

  const multiN = displayCount >= 2 ? Math.min(10, displayCount) : 10;

  const pull = (n: number) => {
    if (drawing || displayCount < 1) return;
    setShake(true);
    setTimeout(() => setShake(false), 360);
    setDrawing(true);
    setOptimistic(Math.max(0, displayCount - n)); // 낙관 차감
    openAction(slot, n)
      .then((r) => {
        if (r.status === 'error') {
          showError(r.message);
          setOptimistic(null); // 실패 → prop으로 원복
          return;
        }
        setResult(r);
        sounds.gachaOpen(); // 상자 개봉음
        setOptimistic(r.remaining); // 서버 권위 잔여
        router.refresh(); // 백그라운드 동기화(로딩 게이트에 영향 없음)
      })
      .catch(() => {
        showError('보급 개봉에 실패했습니다. 잠시 후 다시 시도해주세요.');
        setOptimistic(null);
      })
      .finally(() => setDrawing(false)); // 액션 응답 즉시 로딩 해제(refresh 대기 안 함)
  };

  return (
    <>
      <div
        style={{
          backgroundColor: tint,
          animation: shake ? 'gacha-box-shake 360ms ease-in-out' : undefined,
        }}
        className="relative isolate overflow-hidden rounded-2xl border border-zinc-800"
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
        <div className="relative flex flex-col justify-between gap-7 bg-gradient-to-b from-black/0 via-black/45 to-black/85 px-4 py-4">
          <div className="flex items-baseline justify-between">
            <h2 className="text-base font-bold text-white drop-shadow-sm">{label}</h2>
            <span className="text-xs text-white/85">
              보유 <span className="font-mono font-semibold tabular-nums">{displayCount}</span>개
            </span>
          </div>

          {/* 두 버튼 grid-cols-2로 폭 동일 — multiN 라벨 가변에 따른 width 흔들림 방지. */}
          <div className="ml-auto grid w-44 grid-cols-2 gap-1.5">
            <button
              type="button"
              data-tut="open-box"
              disabled={drawing || displayCount < 1}
              onClick={() => pull(1)}
              className="rounded-md bg-white/95 px-3 py-1.5 text-center text-[11px] font-semibold text-zinc-900 shadow-sm transition-transform active:scale-95 disabled:opacity-40"
            >
              1회 열기
            </button>
            <button
              type="button"
              disabled={drawing || displayCount < 2}
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
          pulling={drawing}
          onAgain={pull}
          onClose={() => setResult(null)}
        />
      ) : null}
    </>
  );
}
