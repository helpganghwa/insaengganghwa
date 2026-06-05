'use client';

import { useEffect, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

import type { TutorialStep } from '@/lib/game/tutorial';
import { skipTutorialAction } from '@/app/(game)/tutorial/actions';

/**
 * 신규 튜토리얼 스포트라이트 코치마크 — 전역 오버레이.
 * 서버가 파생한 단계(step)를 받아, 현재 화면(pathname)에 존재하는 타겟 요소를
 * data-tut 속성으로 찾아 딤+컷아웃으로 강조하고 말풍선으로 다음 행동을 유도.
 * 타겟이 실제 버튼이라 클릭은 그대로 통과(오버레이는 pointer-events-none).
 *
 * QA 프리뷰: ?tut=open|equip|enhance 로 진입하면(자원 미지급) 강제 노출 + 전역
 * 플로팅 바로 단계 전환. 상태는 레이아웃 마운트 유지로 화면 이동 간 지속.
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
const PREVIEW_STEPS: TutorialStep[] = ['open', 'equip', 'enhance'];
const PREVIEW_LABEL: Record<TutorialStep, string> = { open: '보급', equip: '장착', enhance: '강화' };
const PAD = 0;
const DIM = 'rgba(0,0,0,0.62)';
const TOOLTIP_W = 220;

const asStep = (v: string | null): TutorialStep | null =>
  v && (PREVIEW_STEPS as string[]).includes(v) ? (v as TutorialStep) : null;

export function TutorialCoach({ step }: { step: TutorialStep | null }) {
  const pathname = usePathname();
  const search = useSearchParams();
  const [skipped, setSkipped] = useState(false);
  // 프리뷰는 URL(?tut=)로 1회 시드 후 상태로 유지(레이아웃 마운트 지속 → 화면 이동에도 보존).
  const [preview, setPreview] = useState<TutorialStep | null>(() => asStep(search.get('tut')));
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [copy, setCopy] = useState('');

  const effective = preview ?? step;
  const isPreview = preview !== null;

  useEffect(() => {
    if (!effective || skipped) return;
    let alive = true;
    const measure = () => {
      if (!alive) return;
      for (const c of STEP_TARGETS[effective]) {
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
      setCopy(FALLBACK[effective]);
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
  }, [effective, skipped, pathname]);

  if (!effective || skipped || typeof window === 'undefined') return null;

  const onSkip = () => {
    if (isPreview) {
      setPreview(null);
      return;
    }
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
          {/* 4분할 딤 마스크 — 구멍(타겟) 밖은 pointer-events-auto로 클릭 차단, 구멍은 통과. */}
          <div
            className="pointer-events-auto absolute left-0 right-0 top-0"
            style={{ height: spot.top, background: DIM }}
          />
          <div
            className="pointer-events-auto absolute bottom-0 left-0 right-0"
            style={{ top: spot.top + spot.height, background: DIM }}
          />
          <div
            className="pointer-events-auto absolute left-0"
            style={{ top: spot.top, width: spot.left, height: spot.height, background: DIM }}
          />
          <div
            className="pointer-events-auto absolute right-0"
            style={{ top: spot.top, left: spot.left + spot.width, height: spot.height, background: DIM }}
          />
          {/* 펄스 링 — 클릭은 타겟으로 통과(pointer-events-none). */}
          <div
            className="pointer-events-none absolute animate-pulse rounded-md ring-2 ring-amber-400"
            style={{ top: spot.top, left: spot.left, width: spot.width, height: spot.height }}
          />
        </>
      ) : (
        // 타겟 미발견 — 화면 이동이 필요하므로 클릭 차단하지 않음(pointer-events-none 유지).
        <div className="absolute inset-0 bg-black/45" />
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
            {isPreview ? '미리보기' : '튜토리얼'} {STEP_NO[effective]}/3
          </div>
          <p className="text-[13px] font-bold leading-snug break-keep">{copy}</p>
        </div>
      </div>

      {/* 건너뛰기 / 미리보기 종료 */}
      <button
        type="button"
        onClick={onSkip}
        className="pointer-events-auto absolute right-3 top-[calc(env(safe-area-inset-top)+14px)] rounded-full bg-black/60 px-3 py-1.5 text-[11px] font-semibold text-white backdrop-blur-sm"
      >
        {isPreview ? '미리보기 종료 ✕' : '건너뛰기 ✕'}
      </button>

      {/* QA 전역 플로팅 바 — 단계 전환(테스트용). 프리뷰일 때만. */}
      {isPreview ? (
        <div className="pointer-events-auto fixed bottom-[calc(env(safe-area-inset-bottom)+70px)] left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full bg-zinc-900/90 px-2 py-1.5 shadow-xl ring-1 ring-amber-400/40 backdrop-blur-sm">
          <span className="px-1 text-[10px] font-bold text-amber-300">QA</span>
          {PREVIEW_STEPS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setPreview(s)}
              className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${
                effective === s ? 'bg-amber-400 text-amber-950' : 'bg-white/10 text-white'
              }`}
            >
              {STEP_NO[s]} {PREVIEW_LABEL[s]}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setPreview(null)}
            className="ml-0.5 rounded-full bg-white/10 px-2 py-1 text-[11px] font-bold text-white"
          >
            종료
          </button>
        </div>
      ) : null}
    </div>
  );
}
