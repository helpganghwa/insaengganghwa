'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { GAME_RATING } from '@/lib/legal/content';

/**
 * 게임물 등급 표시(게임산업법 §33) — 게임 내 헤더 토스트 바로 노출(보상/알림 토스트와 동일 UX).
 *  · 진입: 세션당 1회, 상단에서 슬라이드로 내려와 4초(법정 최소 3초 이상) 후 자동으로 올라가 사라짐.
 *  · 온라인 1시간마다 반복(온라인 등급 요건): 동일 토스트.
 * 구성: '게임물 등급' │ [전체이용가 심볼][폭력성 아이콘] 전체이용가. 조작 안 막음(pointer-events 통과).
 * 상세(기관·분류번호·내용정보 전체)는 법적고지 페이지·푸터에 상시 표기 → 토스트는 최소 정보로 비침습.
 */
const SESSION_KEY = 'ig:rating-shown';
const SHOW_MS = 4000; // 노출 유지(법정 최소 3초 이상 충족)
const SLIDE_MS = 500; // 진입/이탈 슬라이드
const HOUR_MS = 60 * 60 * 1000;
const R = GAME_RATING;

export function GameRatingSplash() {
  const [visible, setVisible] = useState(false); // 마운트 여부
  const [entered, setEntered] = useState(false); // 슬라이드 상태(true=내려옴)
  const [mounted, setMounted] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => setMounted(true), []);

  // 노출 시퀀스: 마운트 → (rAF) 슬라이드 인 → 유지 → 슬라이드 아웃 → 언마운트.
  function trigger() {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setVisible(true);
    requestAnimationFrame(() => setEntered(true));
    timers.current.push(
      setTimeout(() => setEntered(false), SHOW_MS),
      setTimeout(() => setVisible(false), SHOW_MS + SLIDE_MS),
    );
  }

  // 세션 첫 진입 시 1회.
  useEffect(() => {
    let shown = true;
    try {
      shown = sessionStorage.getItem(SESSION_KEY) === '1';
    } catch {
      shown = false; // sessionStorage 불가 → 표시(안전 측)
    }
    if (!shown) {
      try {
        sessionStorage.setItem(SESSION_KEY, '1');
      } catch {
        /* 저장만 생략 */
      }
      trigger();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 1시간마다 반복(온라인 요건).
  useEffect(() => {
    const id = setInterval(trigger, HOUR_MS);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 언마운트 시 타이머 정리.
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  if (!mounted || !visible) return null;

  // 표준 헤더 토스트(ResourceToast HeaderBar)와 동일 3층 구조 — safe-area 아래 h-12 콘텐츠로
  // AppHeader와 정확히 겹쳐 보더가 1개로 보이게(top-0 단독이면 헤더 보더가 삐져나와 2줄로 보임).
  return createPortal(
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[150]">
      <div
        className={`mx-auto max-w-[390px] border-b border-zinc-700/60 bg-zinc-950/95 shadow-[0_4px_16px_rgba(0,0,0,0.5)] backdrop-blur-sm transition-transform duration-500 ease-out ${
          entered ? 'translate-y-0' : '-translate-y-full'
        }`}
        style={{ paddingTop: 'env(safe-area-inset-top)' }}
      >
        <div className="flex h-12 flex-col items-center justify-center gap-0.5 px-3">
          <div className="flex items-center justify-center gap-2">
            <span className="whitespace-nowrap text-[13px] font-bold text-white">게임물 등급</span>
            <span aria-hidden className="h-3.5 w-px shrink-0 bg-zinc-600" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={R.ratingSymbol} alt="전체이용가" className="h-6 w-auto shrink-0" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={R.contentInfo[0].icon} alt="폭력성" className="h-6 w-auto shrink-0" />
            <span className="whitespace-nowrap text-[12.5px] font-semibold text-white">
              {R.rating}
            </span>
          </div>
          <span className="whitespace-nowrap text-[9px] leading-none text-zinc-400">
            {R.authority} {R.classificationNo}
          </span>
        </div>
      </div>
    </div>,
    document.body,
  );
}
