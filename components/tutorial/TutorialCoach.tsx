'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';

import type { TutorialStep } from '@/lib/game/tutorial';
import { skipTutorialAction } from '@/app/(game)/tutorial/actions';

/**
 * 신규 튜토리얼 스포트라이트 코치마크 — 전역 오버레이.
 * 서버가 파생한 단계(step)를 받아, 현재 화면(pathname)에 존재하는 타겟 요소를
 * data-tut 속성으로 찾아 딤+컷아웃으로 강조하고 말풍선으로 다음 행동을 유도.
 * 타겟이 실제 버튼이라 클릭은 그대로 통과(오버레이는 pointer-events-none).
 */
type Candidate = { sel: string; copy: string };

const STEP_TARGETS: Record<TutorialStep, Candidate[]> = {
  open: [
    { sel: '[data-tut="open-box"]', copy: '여기서 보급 상자를 열어 첫 장비를 얻어보세요.' },
    { sel: '[data-tut="goto-gacha"]', copy: '보급소로 가서 상자를 열어보세요.' },
  ],
  equip: [
    { sel: '[data-tut="equip-btn"]', copy: '이 장비를 장착해 보세요.' },
    { sel: '[data-tut="inv-item"]', copy: '장비를 눌러 상세를 열고 장착하세요.' },
    { sel: '[data-tut="nav-inventory"]', copy: '인벤토리로 이동하세요.' },
  ],
  enhance: [
    { sel: '[data-tut="enhance-btn"]', copy: '강화 버튼을 눌러 첫 강화를 시작하세요!' },
    { sel: '[data-tut="inv-item"]', copy: '장비를 눌러 강화해 보세요.' },
    { sel: '[data-tut="nav-inventory"]', copy: '인벤토리로 이동하세요.' },
  ],
};

const FALLBACK: Record<TutorialStep, string> = {
  open: '홈 → 보급에서 상자를 열어 첫 장비를 얻으세요.',
  equip: '인벤토리에서 장비를 장착하세요.',
  enhance: '인벤토리에서 장비를 강화해 보세요.',
};

const STEP_NO: Record<TutorialStep, number> = { open: 1, equip: 2, enhance: 3 };
const PAD = 8;
const TOOLTIP_W = 220;

export function TutorialCoach({ step }: { step: TutorialStep | null }) {
  const pathname = usePathname();
  const [skipped, setSkipped] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [copy, setCopy] = useState('');

  useEffect(() => {
    if (!step || skipped) return;
    let alive = true;
    const measure = () => {
      if (!alive) return;
      for (const c of STEP_TARGETS[step]) {
        const el = document.querySelector(c.sel);
        if (el) {
          const r = el.getBoundingClientRect();
          if (r.width > 0 && r.height > 0) {
            setRect(r);
            setCopy(c.copy);
            return;
          }
        }
      }
      setRect(null);
      setCopy(FALLBACK[step]);
    };
    measure();
    const id = window.setInterval(measure, 180);
    window.addEventListener('scroll', measure, true);
    window.addEventListener('resize', measure);
    return () => {
      alive = false;
      window.clearInterval(id);
      window.removeEventListener('scroll', measure, true);
      window.removeEventListener('resize', measure);
    };
  }, [step, skipped, pathname]);

  if (!step || skipped || typeof window === 'undefined') return null;

  const onSkip = () => {
    setSkipped(true);
    void skipTutorialAction();
  };

  const vw = window.innerWidth;
  const vh = window.innerHeight;

  // 스포트라이트 컷아웃(box-shadow로 주변 딤).
  const spot = rect
    ? {
        top: Math.max(0, rect.top - PAD),
        left: Math.max(0, rect.left - PAD),
        width: rect.width + PAD * 2,
        height: rect.height + PAD * 2,
      }
    : null;

  // 말풍선 위치 — 타겟 아래 우선, 공간 없으면 위. 가로는 타겟 중심 정렬(뷰포트 클램프).
  let tip: { top: number; left: number; above: boolean } | null = null;
  if (spot) {
    const below = spot.top + spot.height + 10;
    const above = below + 110 > vh; // 아래 공간 부족하면 위로
    const centerX = rect!.left + rect!.width / 2;
    const left = Math.min(Math.max(8, centerX - TOOLTIP_W / 2), vw - 8 - TOOLTIP_W);
    tip = { top: above ? spot.top - 10 : below, left, above };
  }

  return (
    <div className="pointer-events-none fixed inset-0 z-50">
      {spot ? (
        <>
          <div
            className="absolute rounded-xl"
            style={{
              top: spot.top,
              left: spot.left,
              width: spot.width,
              height: spot.height,
              boxShadow: '0 0 0 9999px rgba(0,0,0,0.62)',
              transition: 'all 140ms ease-out',
            }}
          />
          <div
            className="absolute animate-pulse rounded-xl ring-2 ring-amber-400"
            style={{ top: spot.top, left: spot.left, width: spot.width, height: spot.height }}
          />
        </>
      ) : (
        <div className="absolute inset-0 bg-black/55" />
      )}

      {/* 말풍선 */}
      <div
        className="pointer-events-auto absolute"
        style={
          tip
            ? {
                top: tip.top,
                left: tip.left,
                width: TOOLTIP_W,
                transform: tip.above ? 'translateY(-100%)' : undefined,
              }
            : { top: '42%', left: '50%', width: TOOLTIP_W, transform: 'translate(-50%,-50%)' }
        }
      >
        <div className="rounded-xl bg-amber-400 px-3.5 py-2.5 text-amber-950 shadow-xl">
          <div className="mb-0.5 text-[10px] font-bold opacity-70">
            튜토리얼 {STEP_NO[step]}/3
          </div>
          <p className="text-[13px] font-bold leading-snug break-keep">{copy}</p>
        </div>
      </div>

      {/* 건너뛰기 */}
      <button
        type="button"
        onClick={onSkip}
        className="pointer-events-auto absolute right-3 top-[calc(env(safe-area-inset-top)+14px)] rounded-full bg-black/60 px-3 py-1.5 text-[11px] font-semibold text-white backdrop-blur-sm"
      >
        건너뛰기 ✕
      </button>
    </div>
  );
}
