'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

import type { TutorialStep } from '@/lib/game/tutorial';
import { startTutorialAction, skipTutorialAction } from '@/app/(game)/tutorial/actions';
import { TutorialCompleteModal } from './TutorialCompleteModal';
import { TutorialIntroModal } from './TutorialIntroModal';

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
    { sel: '[data-tut="gacha-confirm"]', copy: '장비를 획득했어요! 🎉 ‘확인’을 눌러 마무리해요.' },
    { sel: '[data-tut="open-box"]', copy: '좋아요! 여기 ‘1회 열기’를 눌러 상자를 열어볼까요?' },
    { sel: '[data-tut="goto-gacha"]', copy: '먼저 보급소에서 첫 장비를 얻어볼게요. 여길 눌러 들어가요!' },
  ],
  equip: [
    { sel: '[data-tut="gacha-confirm"]', copy: '장비를 획득했어요! 🎉 ‘확인’을 눌러 마무리해요.' },
    { sel: '[data-tut="equip-btn"]', copy: '이 장비를 ‘장착’해서 바로 착용해볼게요!' },
    {
      sel: '[data-tut="inv-item"]',
      copy: '축하해요, 첫 장비를 얻었어요! 🎉 장비를 콕 눌러 자세히 볼까요?',
    },
    { sel: '[data-tut="nav-inventory"]', copy: '획득한 장비는 인벤토리에 있어요. 인벤토리로 가볼까요?' },
  ],
  enhance: [
    { sel: '[data-tut="enhance-btn"]', copy: '준비 끝! ‘강화’ 버튼을 눌러 강화를 시작해요 ⚒️' },
    {
      sel: '[data-tut="inv-item"]',
      copy: '장착 완료! ✨ 이번엔 이 장비를 더 강하게 만들어볼까요? 장비를 눌러요!',
    },
    { sel: '[data-tut="nav-inventory"]', copy: '강화할 장비를 고르러 인벤토리로 가볼게요!' },
  ],
  attempt: [
    {
      sel: '[data-tut="enhance-attempt"]',
      copy: '강화는 시간이 지날수록 성공 확률이 올라가요! 슬롯을 눌러 바로 도전하거나, 더 기다렸다 해도 좋아요 ⚒️',
    },
    { sel: '[data-tut="nav-enhance"]', copy: '강화소로 이동해 강화를 시도해볼까요?' },
  ],
};

const FALLBACK: Record<TutorialStep, string> = {
  open: '홈에서 ‘보급’으로 가서 첫 장비를 얻어볼까요?',
  equip: '인벤토리에서 방금 얻은 장비를 장착해봐요!',
  enhance: '인벤토리에서 장비를 골라 강화해볼까요?',
  attempt: '강화소에서 첫 강화에 도전해봐요 ⚒️',
};

const STEP_NO: Record<TutorialStep, number> = { open: 1, equip: 2, enhance: 3, attempt: 4 };
const STEP_TOTAL = 4;
const STEP_ORDER: TutorialStep[] = ['open', 'equip', 'enhance', 'attempt'];
const idxOf = (s: TutorialStep | null) => (s ? STEP_ORDER.indexOf(s) : -1);
const PREVIEW_STEPS: TutorialStep[] = ['open', 'equip', 'enhance', 'attempt'];
const PREVIEW_LABEL: Record<TutorialStep, string> = {
  open: '보급',
  equip: '장착',
  enhance: '강화',
  attempt: '시도',
};
const PAD = 0;
const DIM = 'rgba(0,0,0,0.62)';
const TOOLTIP_W = 220;

/** 둥근 사각형 path(시계방향). r는 코너 반경. */
function roundRectPath(x: number, y: number, w: number, h: number, r: number): string {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  if (rr <= 0) return `M${x} ${y}H${x + w}V${y + h}H${x}Z`;
  return (
    `M${x + rr} ${y}H${x + w - rr}A${rr} ${rr} 0 0 1 ${x + w} ${y + rr}` +
    `V${y + h - rr}A${rr} ${rr} 0 0 1 ${x + w - rr} ${y + h}` +
    `H${x + rr}A${rr} ${rr} 0 0 1 ${x} ${y + h - rr}` +
    `V${y + rr}A${rr} ${rr} 0 0 1 ${x + rr} ${y}Z`
  );
}

const asStep = (v: string | null): TutorialStep | null =>
  v && (PREVIEW_STEPS as string[]).includes(v) ? (v as TutorialStep) : null;

export function TutorialCoach({
  intro,
  step,
}: {
  intro: boolean;
  step: TutorialStep | null;
}) {
  const pathname = usePathname();
  const search = useSearchParams();
  const [, startAction] = useTransition();
  const [introDone, setIntroDone] = useState(false); // 인트로 선택 후 즉시 닫기(낙관)
  // 프리뷰는 URL(?tut=)로 1회 시드 후 상태로 유지(레이아웃 마운트 지속 → 화면 이동에도 보존).
  const [preview, setPreview] = useState<TutorialStep | null>(() => asStep(search.get('tut')));
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [radius, setRadius] = useState(0); // 타겟 요소의 border-radius(px)
  const [copy, setCopy] = useState('');
  const [optimistic, setOptimistic] = useState<TutorialStep | null>(null); // 액션 기반 낙관 전진
  const [completed, setCompleted] = useState(false); // 마무리 팝업
  const lastSel = useRef<string | null>(null); // 타겟이 바뀔 때만 스크롤(루프 방지)

  // 낙관치가 서버 step보다 앞서면 그걸 사용 → 서버 파생 지연 동안 이전 단계 플래시 방지.
  const effective =
    preview ??
    (step !== null && optimistic && idxOf(optimistic) > idxOf(step) ? optimistic : step);
  const isPreview = preview !== null;

  // 액션 신호 — 즉시 다음 단계로(advance) / 마무리 팝업(complete).
  useEffect(() => {
    const onAdvance = () => {
      setOptimistic((cur) => {
        const i = idxOf(cur ?? step);
        return i >= 0 && i < STEP_ORDER.length - 1 ? STEP_ORDER[i + 1] : cur;
      });
      window.setTimeout(() => setOptimistic(null), 4000); // 실패/지연 대비 안전 해제
    };
    const onComplete = () => {
      if (preview) return;
      const eff =
        step !== null && optimistic && idxOf(optimistic) > idxOf(step) ? optimistic : step;
      if (eff === 'attempt') setCompleted(true);
    };
    window.addEventListener('tutorial:advance', onAdvance);
    window.addEventListener('tutorial:complete', onComplete);
    return () => {
      window.removeEventListener('tutorial:advance', onAdvance);
      window.removeEventListener('tutorial:complete', onComplete);
    };
  }, [step, preview, optimistic]);

  useEffect(() => {
    if (!effective) return;
    let alive = true;
    const measure = () => {
      if (!alive) return;
      for (const c of STEP_TARGETS[effective]) {
        const el = document.querySelector(c.sel);
        if (el) {
          const r = el.getBoundingClientRect();
          if (r.width > 0 && r.height > 0) {
            // 새 타겟이면 1회 스크롤 — 바텀네비 등에 가리지 않게 화면 중앙으로.
            if (lastSel.current !== c.sel) {
              lastSel.current = c.sel;
              el.scrollIntoView({ block: 'center', behavior: 'instant' as ScrollBehavior });
            }
            setRect(r);
            setRadius(parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0);
            setCopy(c.copy);
            return;
          }
        }
      }
      lastSel.current = null;
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
  }, [effective, pathname]);

  // 구멍 밖 클릭만 캡처 차단(스크롤·터치는 통과). 타겟·코치 UI는 허용, 폴백(타겟 없음)이면
  // 화면 이동을 위해 차단 안 함. 프리뷰(QA)에서도 자유 이동 위해 비활성.
  useEffect(() => {
    if (!effective || preview) return;
    const onClickCapture = (e: MouseEvent) => {
      const t = e.target as Element | null;
      if (!t || typeof t.closest !== 'function') return;
      if (t.closest('[data-tut-ui]')) return; // 말풍선 등 코치 UI
      const sel = lastSel.current;
      if (!sel) return; // 타겟 미발견(폴백) — 차단 안 함
      if (t.closest(sel)) return; // 하이라이트된 타겟
      e.preventDefault();
      e.stopPropagation();
    };
    document.addEventListener('click', onClickCapture, true);
    return () => document.removeEventListener('click', onClickCapture, true);
  }, [effective, preview]);

  if (typeof window === 'undefined') return null;
  // 인트로 — 메인페이지 첫 진입 시 시작/건너뛰기(프리뷰 제외).
  if (intro && !introDone && !isPreview && pathname === '/') {
    return (
      <TutorialIntroModal
        pending={false}
        onStart={() => {
          setIntroDone(true);
          startAction(() => {
            void startTutorialAction();
          });
        }}
        onSkip={() => {
          setIntroDone(true);
          startAction(() => {
            void skipTutorialAction();
          });
        }}
      />
    );
  }
  if (completed) return <TutorialCompleteModal onClose={() => setCompleted(false)} />;
  if (!effective) return null;

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
    <div className="pointer-events-none fixed inset-0 z-[61]">
      {spot ? (
        <>
          {/* SVG 딤 마스크 — 타겟 radius를 따르는 둥근 구멍. 딤(path)은 클릭 차단, 구멍은 통과. */}
          {/* 딤은 터치/스크롤 통과(pointer-events-none) — 모바일 스크롤 보존. 구멍 밖
              클릭만 캡처 단계에서 차단(아래 useEffect). */}
          <svg className="pointer-events-none absolute inset-0 h-full w-full">
            <path
              fill={DIM}
              fillRule="evenodd"
              d={`M0 0H${vw}V${vh}H0Z${roundRectPath(spot.left, spot.top, spot.width, spot.height, radius)}`}
            />
          </svg>
          {/* 펄스 링 — 타겟 radius와 동일. 클릭은 타겟으로 통과(pointer-events-none). */}
          <div
            className="pointer-events-none absolute animate-pulse ring-2 ring-amber-400"
            style={{
              top: spot.top,
              left: spot.left,
              width: spot.width,
              height: spot.height,
              borderRadius: Math.max(0, Math.min(radius, spot.width / 2, spot.height / 2)),
            }}
          />
        </>
      ) : (
        // 타겟 미발견 — 화면 이동이 필요하므로 클릭 차단하지 않음(pointer-events-none 유지).
        <div className="absolute inset-0 bg-black/45" />
      )}

      {/* 말풍선 */}
      <div
        data-tut-ui
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
            {isPreview ? '미리보기' : '튜토리얼'} {STEP_NO[effective]}/{STEP_TOTAL}
          </div>
          <p className="text-[13px] font-bold leading-snug break-keep">{copy}</p>
        </div>
      </div>

      {/* 스킵 불가(실제 튜토리얼). 미리보기(QA)에서만 종료 버튼 노출. */}
      {isPreview ? (
        <button
          type="button"
          onClick={() => setPreview(null)}
          className="pointer-events-auto absolute right-3 top-[calc(env(safe-area-inset-top)+14px)] rounded-full bg-black/60 px-3 py-1.5 text-[11px] font-semibold text-white backdrop-blur-sm"
        >
          미리보기 종료 ✕
        </button>
      ) : null}

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
            onClick={() => setCompleted(true)}
            className="rounded-full bg-white/10 px-2 py-1 text-[11px] font-bold text-white"
          >
            완료
          </button>
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
