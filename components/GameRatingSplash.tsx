'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

import { GAME_RATING } from '@/lib/legal/content';
import { RatingSymbol, RatingContentIcons } from './GameRating';

/**
 * 게임물 등급 표시(게임산업법 §33) — 상단 작은 배너로 통일(최소 침습).
 *  · 진입: 초기화면에 배너 노출(4초 = 법정 최소 3초 이상 충족) · 세션당 1회(sessionStorage).
 *  · 온라인 1시간 반복(온라인 등급 요건): 동일 배너.
 * 게임 조작 안 막음(pointer-events 통과) · 자동 사라짐. 상세(기관·번호·내용정보 전체)는 법적고지·푸터.
 */
const SESSION_KEY = 'ig:rating-shown';
const SHOW_MS = 4000; // 법정 최소 3초 이상 충족
const HOUR_MS = 60 * 60 * 1000;
const R = GAME_RATING;

export function GameRatingSplash() {
  const [show, setShow] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

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
      setShow(true);
    }
  }, []);

  // 1시간마다 반복(온라인 요건).
  useEffect(() => {
    const id = setInterval(() => setShow(true), HOUR_MS);
    return () => clearInterval(id);
  }, []);

  // 자동 종료(3초 이상).
  useEffect(() => {
    if (!show) return;
    const t = setTimeout(() => setShow(false), SHOW_MS);
    return () => clearTimeout(t);
  }, [show]);

  if (!mounted || !show) return null;

  return createPortal(
    <div className="pointer-events-none fixed inset-x-0 top-0 z-40 flex justify-center px-3 pt-[calc(env(safe-area-inset-top)+8px)]">
      <div className="pointer-events-auto inline-flex max-w-[94%] items-center gap-2 rounded-full bg-zinc-900/95 px-3 py-1.5 text-[10.5px] text-zinc-200 shadow-lg ring-1 ring-white/10 backdrop-blur-sm">
        <RatingSymbol className="h-5" />
        <RatingContentIcons className="h-4" />
        <span className="whitespace-nowrap">
          <b className="font-semibold text-emerald-400">{R.rating}</b> · 내용정보{' '}
          {R.contentInfo.map((c) => c.label).join('·')} · {R.classificationNo}
        </span>
      </div>
    </div>,
    document.body,
  );
}
