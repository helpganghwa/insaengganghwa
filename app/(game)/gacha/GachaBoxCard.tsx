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

  // 자동 반복 — ⚙ 팝업에서 켠 뒤 1/N회 누르면 그 버튼이 '중지'로 바뀌고, 상자 소진/중지까지
  // **별도 UI 없이** 자동으로 눌리는 효과(결과 모달·오버레이 없음). 다 열거나 중지 시 버튼 원복.
  const [autoRepeat, setAutoRepeat] = useState(false);
  const [autoMenu, setAutoMenu] = useState(false); // 자동 체크 팝업(⚙)
  const [autoRunning, setAutoRunning] = useState(false); // 진행 중(버튼→중지)
  const autoRunRef = useRef(false);
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const runAutoOpen = async (per: number) => {
    if (drawing || autoRunning || displayCount < 1) return;
    autoRunRef.current = true;
    setAutoRunning(true);
    let remaining = displayCount;
    while (autoRunRef.current && remaining >= 1) {
      const n = Math.min(per, remaining);
      setShake(true); // 버튼 눌리는 효과(상자 흔들림)
      setTimeout(() => setShake(false), 280);
      setOptimistic(Math.max(0, remaining - n)); // 낙관 차감
      const r = await openAction(slot, n).catch(() => null);
      if (!autoRunRef.current) break; // 중지/이탈 중 응답
      if (!r || r.status === 'error') {
        if (r && r.status === 'error') showError(r.message);
        setOptimistic(null);
        break;
      }
      remaining = r.remaining;
      setOptimistic(r.remaining); // 서버 권위 잔여
      if (remaining < 1) break;
      await sleep(500); // 개봉 간격
    }
    autoRunRef.current = false;
    sounds.gachaOpen();
    setAutoRunning(false); // 버튼 원복(1회/10회)
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
            <div className="flex items-center gap-2">
              <span className="text-xs text-white/85">
                보유 <span className="font-mono font-semibold tabular-nums">{displayCount}</span>개
              </span>
              <button
                type="button"
                aria-label="자동 반복 설정"
                onClick={() => setAutoMenu((v) => !v)}
                className={`rounded px-1.5 py-0.5 text-[12px] leading-none transition ${
                  autoRepeat ? 'bg-amber-500/90 text-black' : 'bg-white/15 text-white/80'
                }`}
              >
                ⚙
              </button>
            </div>
          </div>

          <div className="ml-auto w-44">
            {autoRunning ? (
              <button
                type="button"
                onClick={() => { autoRunRef.current = false; }}
                className="w-full rounded-md bg-red-500 px-3 py-1.5 text-center text-[11px] font-bold text-white shadow-sm transition-transform active:scale-95"
              >
                ■ 중지
              </button>
            ) : (
              /* 두 버튼 grid-cols-2로 폭 동일 — multiN 라벨 가변에 따른 width 흔들림 방지. */
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  data-tut="open-box"
                  disabled={drawing || displayCount < 1}
                  onClick={() => (autoRepeat ? runAutoOpen(1) : pull(1))}
                  className="rounded-md bg-white/95 px-3 py-1.5 text-center text-[11px] font-semibold text-zinc-900 shadow-sm transition-transform active:scale-95 disabled:opacity-40"
                >
                  1회 열기
                </button>
                <button
                  type="button"
                  disabled={drawing || displayCount < 2}
                  onClick={() => (autoRepeat ? runAutoOpen(multiN) : pull(multiN))}
                  className="rounded-md bg-amber-500 px-3 py-1.5 text-center text-[11px] font-semibold text-white shadow-sm transition-transform active:scale-95 disabled:opacity-40"
                >
                  {multiN}회 열기
                </button>
              </div>
            )}
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

        {/* 자동 반복 설정 팝업(⚙) — 자동 체크는 여기서만. */}
        {autoMenu ? (
          <>
            <div className="absolute inset-0 z-20" onClick={() => setAutoMenu(false)} />
            <div className="absolute right-3 top-11 z-30 rounded-lg border border-zinc-700 bg-zinc-900/95 px-3 py-2.5 shadow-xl">
              <label className="flex items-center gap-2 text-[12px] font-semibold text-zinc-100">
                <input type="checkbox" checked={autoRepeat} onChange={(e) => setAutoRepeat(e.target.checked)} className="h-4 w-4 accent-amber-500" />
                자동 반복
              </label>
              <div className="mt-1 max-w-[150px] text-[10px] leading-relaxed text-zinc-500">
                켜면 열기 버튼이 상자 소진까지 자동으로 눌립니다 (버튼이 ‘중지’로 바뀜).
              </div>
            </div>
          </>
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
