'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

import { GAME_RATING } from '@/lib/legal/content';
import { RatingSymbol, RatingContentIcons } from './GameRating';

/**
 * 게임물 등급 표시(게임산업법 §33) — 법정 최소치, 게임 방해 최소화.
 *  · 진입 스플래시: 초기화면 3초(법정 최소) — 세션당 1회(sessionStorage). 자동 사라짐.
 *  · 1시간 반복(온라인 등급 요건): 전체화면 아님, 상단 작은 배너 4초 — 게임 조작 안 막음(pointer-events 통과).
 * 상세(번호·기관·내용정보 전체)는 법적고지 페이지·푸터가 상시 담당.
 */
const SESSION_KEY = 'ig:rating-splash-shown';
const SPLASH_MS = 3200; // 3초 이상(법정 최소)
const BANNER_MS = 4000;
const HOUR_MS = 60 * 60 * 1000;
const R = GAME_RATING;

export function GameRatingSplash() {
  const [mode, setMode] = useState<'splash' | 'banner' | null>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // 세션 첫 진입 시 3초 스플래시(1회).
  useEffect(() => {
    let shown = true;
    try {
      shown = sessionStorage.getItem(SESSION_KEY) === '1';
    } catch {
      // sessionStorage 불가 → 매번 표시(안전 측)
      shown = false;
    }
    if (!shown) {
      try {
        sessionStorage.setItem(SESSION_KEY, '1');
      } catch {
        /* 저장만 생략 */
      }
      setMode('splash');
      const t = setTimeout(() => setMode(null), SPLASH_MS);
      return () => clearTimeout(t);
    }
  }, []);

  // 1시간마다 반복(온라인 요건) — 다른 표시 중이 아니면 상단 배너.
  useEffect(() => {
    const id = setInterval(() => setMode((m) => (m ? m : 'banner')), HOUR_MS);
    return () => clearInterval(id);
  }, []);

  // 배너 자동 종료.
  useEffect(() => {
    if (mode !== 'banner') return;
    const t = setTimeout(() => setMode(null), BANNER_MS);
    return () => clearTimeout(t);
  }, [mode]);

  if (!mounted || !mode) return null;

  if (mode === 'splash') {
    return createPortal(
      <div className="fixed inset-0 z-[70] flex flex-col items-center justify-center gap-4 bg-zinc-950 px-6 text-center">
        <div className="text-xl font-black text-white">인생강화</div>
        <RatingSymbol className="h-16" />
        <div className="text-[12px] leading-relaxed text-zinc-300">
          <div>
            <b className="text-emerald-400">{R.rating}</b> · {R.authority}
          </div>
          <div className="text-zinc-400">{R.classificationNo}</div>
          <div className="mt-2 inline-flex items-center gap-1.5 text-zinc-300">
            <span>내용정보</span>
            <RatingContentIcons className="h-6" />
            <span>{R.contentInfo.map((c) => c.label).join(' · ')}</span>
          </div>
        </div>
        <div className="mt-2 text-[10px] text-zinc-600">잠시 후 시작합니다…</div>
      </div>,
      document.body,
    );
  }

  // 배너 — 상단, 게임 조작 통과(pointer-events-none), 자동 사라짐.
  return createPortal(
    <div className="pointer-events-none fixed inset-x-0 top-0 z-40 flex justify-center px-3 pt-[calc(env(safe-area-inset-top)+8px)]">
      <div className="pointer-events-auto inline-flex max-w-[92%] items-center gap-2 rounded-full bg-zinc-900/95 px-3 py-1.5 text-[10.5px] text-zinc-200 shadow-lg ring-1 ring-white/10 backdrop-blur-sm">
        <RatingSymbol className="h-4" />
        <span>
          <b className="font-semibold text-emerald-400">{R.rating}</b> · 내용정보{' '}
          {R.contentInfo.map((c) => c.label).join('·')} · {R.classificationNo}
        </span>
      </div>
    </div>,
    document.body,
  );
}
