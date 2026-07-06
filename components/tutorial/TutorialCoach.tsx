'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { usePathname } from 'next/navigation';

import type { TutorialStep, TutorialState } from '@/lib/game/tutorial';
import { startTutorialAction, skipTutorialAction } from '@/app/(game)/tutorial/actions';
import { TutorialCompleteModal } from './TutorialCompleteModal';
import { TutorialIntroModal } from './TutorialIntroModal';

/**
 * 신규 튜토리얼 스포트라이트 코치마크 — 전역 오버레이.
 *
 * 서버 통신은 **첫 진입 1회**(intro/active/done 판별 + 재개용 단계)만. 이후 진행은
 * 전부 클라 상태머신(localStep) — 액션 이벤트(advance/complete)로 단계 전진, localStorage에
 * 저장(새로고침 재개). 시작/스킵/완료만 서버에 fire-and-forget 마킹. → 단계마다 서버
 * 파생을 안 해 lag·깜빡임·리마운트가 없다.
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
  // nav-enhance(바텀 탭)는 제외 — 강화 버튼이 자동으로 /enhance로 이동하므로 '이동' 단계 불필요.
  // enhance-confirm: 첫 탭 후 '확인' 오버레이가 뜬 상태(한 번 더 탭해야 강화). 우선순위 위.
  attempt: [
    {
      sel: '[data-tut="enhance-confirm"]',
      copy: '한 번 더 눌러 강화를 시작하세요! ⚒️',
    },
    {
      sel: '[data-tut="enhance-attempt"]',
      copy: '강화 슬롯을 두 번 탭해요! 첫 탭은 확인, 한 번 더 누르면 강화 시작 — 시간이 지날수록 성공 확률이 올라가요 ⚒️',
    },
  ],
};

const STEP_NO: Record<TutorialStep, number> = { open: 1, equip: 2, enhance: 3, attempt: 4 };
const STEP_TOTAL = 4;
const STEP_ORDER: TutorialStep[] = ['open', 'equip', 'enhance', 'attempt'];
const idxOf = (s: TutorialStep | null) => (s ? STEP_ORDER.indexOf(s) : -1);
const LS_STEP = 'tut_step';
const PAD = 0;
const DIM = 'rgba(0,0,0,0.62)';
const TOOLTIP_W = 220;

const isStep = (v: string | null): v is TutorialStep =>
  !!v && (STEP_ORDER as string[]).includes(v);

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

export function TutorialCoach({ statePromise }: { statePromise: Promise<TutorialState> }) {
  const pathname = usePathname();
  const [, startAction] = useTransition();

  const [phase, setPhase] = useState<TutorialState['phase']>('done'); // 서버 1회
  const [started, setStarted] = useState(false); // 인트로 '시작' 낙관(즉시 active)
  const [completed, setCompleted] = useState(false); // 마무리 팝업
  // 클라 단계 머신 — localStorage에서 복원(새로고침 재개).
  const [localStep, setLocalStep] = useState<TutorialStep | null>(() => {
    if (typeof window === 'undefined') return null;
    try {
      const v = localStorage.getItem(LS_STEP);
      return isStep(v) ? v : null;
    } catch {
      return null;
    }
  });
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [radius, setRadius] = useState(0);
  const [copy, setCopy] = useState('');
  const lastSel = useRef<string | null>(null);
  const navAtRef = useRef(0);
  const mountedRef = useRef(false);

  // 서버 상태 1회 해소 — Suspense 미사용(코치 항상 마운트 → 상태 리셋 없음).
  useEffect(() => {
    let alive = true;
    Promise.resolve(statePromise)
      .then((s) => {
        if (!alive) return;
        setPhase(s.phase);
        // localStorage가 비어 있고 active면 서버 파생 step으로 재개(이후엔 로컬 우선).
        if (s.phase === 'active' && s.step) setLocalStep((cur) => cur ?? s.step);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [statePromise]);

  const active = started || phase === 'active';
  const effective = active ? (localStep ?? 'open') : null;

  const persist = (s: TutorialStep | null) => {
    try {
      if (s) localStorage.setItem(LS_STEP, s);
      else localStorage.removeItem(LS_STEP);
    } catch {
      /* noop */
    }
  };

  // 액션 신호 — 클라 단계 머신 전진 / 마무리 팝업(서버 통신 없음).
  useEffect(() => {
    const onAdvance = () => {
      setLocalStep((cur) => {
        const i = idxOf(cur ?? 'open');
        const next = i >= 0 && i < STEP_ORDER.length - 1 ? STEP_ORDER[i + 1] : cur ?? 'open';
        persist(next);
        return next;
      });
    };
    const onComplete = () => {
      if (started || phase === 'active') setCompleted(true);
    };
    window.addEventListener('tutorial:advance', onAdvance);
    window.addEventListener('tutorial:complete', onComplete);
    return () => {
      window.removeEventListener('tutorial:advance', onAdvance);
      window.removeEventListener('tutorial:complete', onComplete);
    };
  }, [phase, started]);

  // 화면 이동 시각 기록(최초 마운트 제외) — 이동 직후 정착 윈도(전환 플래시 방지).
  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      return;
    }
    navAtRef.current = Date.now();
  }, [pathname]);

  useEffect(() => {
    if (!effective) return;
    let alive = true;
    const measure = () => {
      if (!alive) return;
      if (Date.now() - navAtRef.current < 300) {
        setRect(null);
        setCopy('');
        return;
      }
      for (const c of STEP_TARGETS[effective]) {
        const el = document.querySelector(c.sel);
        if (el) {
          const r = el.getBoundingClientRect();
          if (r.width > 0 && r.height > 0) {
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
      // 타겟 미발견 — 중앙 안내 노출 안 함(빈 copy → 코치 숨김).
      lastSel.current = null;
      setRect(null);
      setCopy('');
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

  // 구멍 밖 클릭만 캡처 차단(스크롤·터치는 통과). 타겟·코치 UI 허용, 폴백이면 차단 안 함.
  // 완료 팝업 중엔 비활성 — 모달 버튼(알림/강화하기) 클릭 차단 방지.
  useEffect(() => {
    if (!effective || completed) return;
    const onClickCapture = (e: MouseEvent) => {
      const t = e.target as Element | null;
      if (!t || typeof t.closest !== 'function') return;
      if (t.closest('[data-tut-ui]')) return;
      const sel = lastSel.current;
      if (!sel) return;
      if (t.closest(sel)) return;
      e.preventDefault();
      e.stopPropagation();
    };
    document.addEventListener('click', onClickCapture, true);
    return () => document.removeEventListener('click', onClickCapture, true);
  }, [effective, completed]);

  if (typeof window === 'undefined') return null;

  // 인트로 — 메인페이지 첫 진입. 시작/건너뛰기는 즉시 클라 반영 + 서버 fire-and-forget.
  if (phase === 'intro' && !started && pathname === '/') {
    return (
      <TutorialIntroModal
        pending={false}
        onStart={() => {
          setStarted(true);
          setLocalStep('open');
          persist('open');
          startAction(async () => {
            await startTutorialAction();
          });
        }}
        onSkip={() => {
          setPhase('done');
          persist(null);
          startAction(async () => {
            await skipTutorialAction();
          });
        }}
      />
    );
  }

  if (completed) {
    return (
      <TutorialCompleteModal
        onClose={() => {
          setCompleted(false);
          setPhase('done');
          setStarted(false);
          persist(null);
          startAction(async () => {
            await skipTutorialAction(); // 완료 = DONE 마킹
          });
        }}
      />
    );
  }

  if (!effective) return null;
  if (!copy) return null; // 정착 윈도·초기 프레임 — 잘못된 문구 깜빡임 방지

  const vw = window.innerWidth;
  const vh = window.innerHeight;

  const spot = rect
    ? {
        top: Math.max(0, rect.top - PAD),
        left: Math.max(0, rect.left - PAD),
        width: rect.width + PAD * 2,
        height: rect.height + PAD * 2,
      }
    : null;

  let tip: { top: number; left: number; above: boolean } | null = null;
  if (spot) {
    const below = spot.top + spot.height + 10;
    const above = below + 110 > vh;
    const centerX = rect!.left + rect!.width / 2;
    const left = Math.min(Math.max(8, centerX - TOOLTIP_W / 2), vw - 8 - TOOLTIP_W);
    tip = { top: above ? spot.top - 10 : below, left, above };
  }

  return (
    <div className="pointer-events-none fixed inset-0 z-[61]">
      {spot ? (
        <>
          {/* 딤은 터치/스크롤 통과(pointer-events-none). 구멍 밖 클릭만 캡처 차단. */}
          <svg className="pointer-events-none absolute inset-0 h-full w-full">
            <path
              fill={DIM}
              fillRule="evenodd"
              d={`M0 0H${vw}V${vh}H0Z${roundRectPath(spot.left, spot.top, spot.width, spot.height, radius)}`}
            />
          </svg>
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
          <div className="mb-0.5 flex items-center justify-between gap-2">
            <span className="text-[10px] font-bold opacity-70">
              튜토리얼 {STEP_NO[effective]}/{STEP_TOTAL}
            </span>
            {/* 중도 그만두기 — 진행 중에도 언제든 종료(인트로 건너뛰기와 동일 처리). */}
            <button
              type="button"
              data-tut-ui
              onClick={() => {
                setPhase('done');
                setStarted(false);
                persist(null);
                startAction(async () => {
                  await skipTutorialAction();
                });
              }}
              className="pointer-events-auto rounded px-1.5 py-0.5 text-[10px] font-bold text-amber-950/60 underline underline-offset-2 hover:text-amber-950"
            >
              그만두기
            </button>
          </div>
          <p className="text-[13px] font-bold leading-snug break-keep">{copy}</p>
        </div>
      </div>
    </div>
  );
}
