'use client';

import { useRef, useState } from 'react';

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

  // 자동 반복 — 자동 켜고 1/N회 누르면 일정 간격으로 상자 소진(또는 멈춤)까지 자동 개봉.
  const [autoRepeat, setAutoRepeat] = useState(false);
  const autoRunRef = useRef(false);
  const [auto, setAuto] = useState<{ opened: number; newN: number; trN: number; done: boolean } | null>(null);
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const runAutoOpen = async (per: number) => {
    if (drawing || displayCount < 1) return;
    autoRunRef.current = true;
    let opened = 0, newN = 0, trN = 0, remaining = displayCount;
    setAuto({ opened, newN, trN, done: false });
    while (autoRunRef.current && remaining >= 1) {
      const n = Math.min(per, remaining);
      setOptimistic(Math.max(0, remaining - n)); // 낙관 차감
      const r = await openAction(slot, n).catch(() => null);
      if (!autoRunRef.current) break; // 멈춤/이탈 중 응답
      if (!r || r.status === 'error') {
        if (r && r.status === 'error') showError(r.message);
        setOptimistic(null);
        break;
      }
      opened += n;
      for (const it of r.results) { if (it.isNew) newN++; trN += it.transcended; }
      remaining = r.remaining;
      setOptimistic(r.remaining); // 서버 권위 잔여
      setAuto({ opened, newN, trN, done: false });
      if (remaining < 1) break;
      await sleep(600); // 개봉 간격
    }
    autoRunRef.current = false;
    sounds.gachaOpen();
    setAuto({ opened, newN, trN, done: true }); // 완료 요약(확인까지 유지)
  };

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
        setOptimistic(r.remaining); // 서버 권위 잔여(이 값이 잔여 카운트의 권위 — refresh 불필요)
        // router.refresh() 제거(2026-07-23, §11.7) — openAction의 revalidatePath('/gacha','/inventory')가
        // prop·인벤을 갱신한다. 잔여는 위 optimistic이 권위, 인벤 반영은 다음 방문 시. 중복 GET 제거.
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

          <div className="ml-auto w-44">
            {/* 자동 반복 토글 — 켜면 아래 열기 버튼이 상자 소진까지 자동 반복. */}
            <label className="mb-1.5 flex items-center justify-end gap-1.5 text-[10px] font-semibold text-white/85">
              <span>자동 반복</span>
              <input
                type="checkbox"
                checked={autoRepeat}
                onChange={(e) => setAutoRepeat(e.target.checked)}
                className="h-3.5 w-3.5 accent-amber-500"
              />
            </label>
            {/* 두 버튼 grid-cols-2로 폭 동일 — multiN 라벨 가변에 따른 width 흔들림 방지. */}
            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                data-tut="open-box"
                disabled={drawing || !!auto || displayCount < 1}
                onClick={() => (autoRepeat ? runAutoOpen(1) : pull(1))}
                className="rounded-md bg-white/95 px-3 py-1.5 text-center text-[11px] font-semibold text-zinc-900 shadow-sm transition-transform active:scale-95 disabled:opacity-40"
              >
                1회 열기
              </button>
              <button
                type="button"
                disabled={drawing || !!auto || displayCount < 2}
                onClick={() => (autoRepeat ? runAutoOpen(multiN) : pull(multiN))}
                className="rounded-md bg-amber-500 px-3 py-1.5 text-center text-[11px] font-semibold text-white shadow-sm transition-transform active:scale-95 disabled:opacity-40"
              >
                {multiN}회 열기
              </button>
            </div>
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

        {/* 자동 개봉 진행/완료 오버레이. */}
        {auto ? (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-1.5 bg-black/85 px-5 text-center backdrop-blur-[2px]">
            {!auto.done ? (
              <>
                <div className="animate-spin text-lg">📦</div>
                <div className="text-[13px] font-bold text-amber-200">자동 개봉 중 · 남은 {displayCount}개</div>
                <div className="text-[11px] text-zinc-300 tabular-nums">개봉 {auto.opened} · 신규 {auto.newN} · 초월 +{auto.trN}</div>
                <button
                  type="button"
                  onClick={() => { autoRunRef.current = false; }}
                  className="mt-1 rounded-md border border-red-500/60 bg-red-900/40 px-4 py-1.5 text-[11px] font-bold text-red-200"
                >
                  ■ 멈춤
                </button>
              </>
            ) : (
              <>
                <div className="text-[13px] font-bold text-amber-200">✦ 자동 개봉 완료</div>
                <div className="text-[11px] text-zinc-200 tabular-nums">개봉 {auto.opened} · 신규 {auto.newN} · 초월 +{auto.trN}</div>
                <button
                  type="button"
                  onClick={() => setAuto(null)}
                  className="mt-1 rounded-md bg-amber-500 px-5 py-1.5 text-[11px] font-bold text-black active:scale-95"
                >
                  확인
                </button>
              </>
            )}
          </div>
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
