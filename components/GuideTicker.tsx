'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { GUIDE_TIPS } from '@/lib/game/guide-tips';

/**
 * 가이드 팁 티커 — GNB 바로 위 얇은 바에서 팁을 순차 롤링(2026-07-14, 페이지별 투어 대체).
 * 탭하면 /guide#{anchor}(게임 안내)로. ×로 끄기(localStorage) → /guide 상단 토글로 재활성.
 * 튜토리얼 진행 중(tut_step)과 /guide 페이지에서는 숨김. 시작 인덱스는 랜덤(매 방문 다른 팁).
 *
 * 긴 팁은 말줄임 대신 **우→좌 marquee**(잠깐 멈췄다 넘치는 만큼 흘러감, keyframes는
 * globals.css `guide-ticker-slide`). 팁 체류 시간은 스크롤 길이에 비례해 자동 연장.
 * 💡 아이콘·× 버튼은 페이드 없이 고정 — 텍스트만 교체 페이드.
 *
 * 겹침 방지(2026-07-14): 티커가 켜져 있을 때만 ① 문서 흐름에 같은 높이의 스페이서를
 * 렌더해 페이지 최하단 콘텐츠를 밀어올리고 ② :root에 --gt-h(px)를 발행해 다른 fixed
 * 요소(길드 생성 FAB 등)가 티커 위로 비켜설 수 있게 한다. 끄면 둘 다 0으로 복귀.
 */
const OFF_KEY = 'guide_ticker_off';
const BASE_MS = 8000; // 짧은 팁 기본 체류
const SCROLL_PX_PER_S = 35; // marquee 속도
const SCROLL_DELAY_MS = 1500; // 스크롤 시작 전 정지(읽기 시작 여유)

export function GuideTicker() {
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);
  const [idx, setIdx] = useState(0);
  const [fade, setFade] = useState(true);
  const wrapRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const [overflowPx, setOverflowPx] = useState(0);
  const [barH, setBarH] = useState(0);

  // 마운트 시 표시 판정(SSR 불일치 방지 — 클라에서만 켬) + 시작 팁 랜덤.
  useEffect(() => {
    try {
      if (localStorage.getItem(OFF_KEY)) return;
      if (localStorage.getItem('tut_step')) return; // 튜토리얼 중 — 코치와 겹침 방지
    } catch {
      return;
    }
    setIdx(Math.floor(Math.random() * GUIDE_TIPS.length));
    setVisible(true);
  }, []);

  // 표시 중엔 바 높이를 측정해 스페이서·--gt-h로 반영(끄면 0 복귀). resize 대응.
  // /guide에선 바를 렌더하지 않으므로(하단 return null) 변수도 0으로 — 잔존값 방지.
  useEffect(() => {
    if (!visible || pathname === '/guide') {
      setBarH(0);
      document.documentElement.style.setProperty('--gt-h', '0px');
      return;
    }
    const measure = () => {
      const h = barRef.current?.offsetHeight ?? 0;
      setBarH(h);
      document.documentElement.style.setProperty('--gt-h', `${h}px`);
    };
    measure();
    window.addEventListener('resize', measure);
    return () => {
      window.removeEventListener('resize', measure);
      document.documentElement.style.setProperty('--gt-h', '0px');
    };
  }, [visible, pathname]);

  // 팁이 바뀔 때마다 넘침(px) 측정 — 넘치면 marquee, 아니면 정지.
  useEffect(() => {
    if (!visible) return;
    const wrap = wrapRef.current;
    const text = textRef.current;
    if (!wrap || !text) return;
    setOverflowPx(Math.max(0, text.scrollWidth - wrap.clientWidth));
  }, [visible, idx]);

  // 롤링 — 체류 시간은 marquee 길이에 비례(스크롤을 다 읽고 나서 교체).
  useEffect(() => {
    if (!visible) return;
    const scrollMs = overflowPx > 0 ? SCROLL_DELAY_MS + (overflowPx / SCROLL_PX_PER_S) * 1000 + 2000 : 0;
    const stayMs = Math.max(BASE_MS, scrollMs);
    const t = window.setTimeout(() => {
      setFade(false);
      window.setTimeout(() => {
        setIdx((i) => (i + 1) % GUIDE_TIPS.length);
        setFade(true);
      }, 250);
    }, stayMs);
    return () => window.clearTimeout(t);
  }, [visible, idx, overflowPx]);

  if (!visible || pathname === '/guide') return null;
  const tip = GUIDE_TIPS[idx]!;
  const scrollDurS = overflowPx / SCROLL_PX_PER_S;

  return (
    <>
      {/* 문서 흐름 스페이서 — 페이지 최하단 콘텐츠가 티커에 가리지 않게 같은 높이만큼 밀어올림. */}
      <div aria-hidden style={{ height: barH }} />
      <div
        className="pointer-events-none fixed inset-x-0 z-20 mx-auto max-w-[390px]"
        style={{ bottom: 'calc(3.5rem + env(safe-area-inset-bottom))' }}
      >
        <div
          ref={barRef}
          className="pointer-events-auto flex items-center gap-1.5 border-t border-zinc-200 bg-white/95 px-3 py-1.5 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/95"
        >
        {/* 💡·×는 고정(페이드 없음) — 텍스트만 교체 페이드 + 넘치면 marquee */}
        <span className="shrink-0 text-[11px] leading-none" aria-hidden>
          💡
        </span>
        <Link
          href={`/guide#${tip.anchor}`}
          className={`min-w-0 flex-1 transition-opacity duration-200 ${fade ? 'opacity-100' : 'opacity-0'}`}
        >
          <div ref={wrapRef} className="flex items-center overflow-hidden">
            <span
              key={idx}
              ref={textRef}
              className="inline-block whitespace-nowrap text-[11px] leading-none text-zinc-600 dark:text-zinc-300"
              style={
                overflowPx > 0
                  ? {
                      animation: `guide-ticker-slide ${scrollDurS}s linear ${SCROLL_DELAY_MS}ms forwards`,
                      ['--gt-shift' as string]: `-${overflowPx}px`,
                    }
                  : undefined
              }
            >
              {tip.text}
            </span>
          </div>
        </Link>
        <button
          type="button"
          aria-label="가이드 팁 끄기"
          onClick={() => {
            try {
              localStorage.setItem(OFF_KEY, '1');
            } catch {
              /* noop */
            }
            setVisible(false);
          }}
          className="shrink-0 px-1 text-[12px] text-zinc-400"
        >
          ✕
        </button>
        </div>
      </div>
    </>
  );
}

/** /guide 상단의 티커 on/off 토글 — 꺼둔 유저의 재활성 경로. */
export function GuideTickerToggle() {
  const [on, setOn] = useState(true);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    try {
      setOn(!localStorage.getItem(OFF_KEY));
    } catch {
      /* noop */
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  if (!mounted) return null;
  return (
    <button
      type="button"
      onClick={() => {
        const next = !on;
        try {
          if (next) localStorage.removeItem(OFF_KEY);
          else localStorage.setItem(OFF_KEY, '1');
        } catch {
          /* noop */
        }
        setOn(next);
      }}
      className={`rounded-full px-2.5 py-1 text-[11px] font-bold transition ${
        on
          ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300'
          : 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400'
      }`}
    >
      {on ? '💡 하단 팁 켜짐' : '하단 팁 꺼짐'}
    </button>
  );
}
