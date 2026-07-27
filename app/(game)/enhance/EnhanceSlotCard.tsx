'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import {
  effectiveOutcomeProbsBp,
  downRateBp,
  diamondToFinishMs,
} from '@/lib/game/balance';
import type { Slot } from '@/lib/db/schema/equipment';
import { TranscendSprite } from '@/components/TranscendSprite';
import { RarityFrame, rarityBorderStyle, hasRarityBorder, TranscendTag } from '@/components/RarityFrame';
import { transcendStyle } from '@/lib/game/equipment/transcend';

import { useResourceToast } from '@/components/ResourceToast';
import { ModalShell } from '@/components/ModalShell';
import { ZoomSafeInput } from '@/components/ui/ZoomSafeField';

import { finalizeEnhance, reduceTimeWithGems, cancelEnhanceAction, autoEnhanceStepAction } from './actions';
import { completeTutorial } from '@/components/tutorial/events';
import { useDiamond } from '@/components/DiamondContext';
import { sounds } from '@/lib/game/sound';

import { EnhanceFX, CountAnim, type FxKind } from './EnhanceFX';

/** §10 자랑 자동 트리거 강화 단계(GDD §6 / 사용자 확정 델타). */

export type ActiveJob = {
  jobId: string;
  code: string;
  name: string;
  slot: Slot;
  fromLevel: number;
  targetLevel: number;
  transcendLevel: number;
  championRank: number | null;
  baseRateBp: number;
  startedAtIso: string;
  completeAtIso: string;
};

type Outcome = 'success' | 'hold' | 'down' | 'mega';
// 강화 시도/결과 로어 — 8 컨셉 세트(망치·용광로·별·운명·강철·대장간·손·불꽃).
// 시도 시 세트 랜덤 선택 → 결과(success/hold/down)도 같은 세트에서 맥락 유지.
const LORE_SETS: ReadonlyArray<
  Readonly<{ attempting: string; success: string; hold: string; down: string; mega?: string }>
> = [
  // 1. 망치 — 정밀한 한 방
  {
    attempting: '운명의 망치가 떨어진다',
    success: '망치가 노래를 부른다… 한 단계 올랐어',
    mega: '망치가 두 번 울었다 — 한 번 더, 한 단계가 더 올랐구나!',
    hold: '망치가 비켜갔지만, 자네 장비 의리가 있어',
    down: '망치가 너무 깊이 들어갔어… 미안하네, 한 단계 하락',
  },
  // 2. 용광로 — 불의 시험
  {
    attempting: '용광로가 으르렁댄다…',
    success: '불꽃이 한 호흡 멈췄다. 그게 바로 성공의 신호야',
    mega: '불꽃이 두 번 멈췄어 — 한 단계가 더 깃들었네',
    hold: '쇠가 굳었어. 다행이지, 단계만 안 떨어졌으면',
    down: '쇠가 토라졌어. 한 단계 떨어졌네',
  },
  // 3. 별 / 모루 — 별이 깃들다
  {
    attempting: '별이 모루 위에 내려앉는다',
    success: '쿵! 망치가 제대로 먹혔다… 별이 깃들었구먼',
    mega: '별 두 개가 같은 자리에 내려앉았다 — 한 단계가 더 올랐어',
    hold: '아슬아슬했어… 한 호흡 더 잡아야겠어',
    down: '균열이 한 줄. 단계가 한 줄. 운명일세',
  },
  // 4. 운명 — 한 박자, 한 호흡
  {
    attempting: '한 박자, 한 호흡, 한 망치',
    success: '운명이 모루 위에 떨어졌다. 자네 편이었어',
    mega: '운명이 두 번 자네 편이었네 — 한 단계가 더 따라왔어',
    hold: '운은 변덕이지. 장비가 멀쩡한 게 어디인가',
    down: '운명이 비웃네. 강철이 한 칸 깎였다',
  },
  // 5. 강철의 노래
  {
    attempting: '쇠가 빨갛게 운다…',
    success: '바로 이 맛이지. 강철이 비명을 멈추고 노래한다',
    mega: '강철이 두 번 노래했다 — 한 단계가 더 단단해졌네',
    hold: '쇠가 버텨줬다. 다음을 노리세',
    down: '쇠가 비명을 질렀다. 단계가 한 줄 깎였구먼',
  },
  // 6. 대장간의 숨
  {
    attempting: '대장간이 숨을 죽인다…',
    success: '50년 망치질에 처음 보는 결이군. 진화 성공!',
    mega: '50년 만에 처음 보는 결이 두 번 — 한 단계가 더 올랐다',
    hold: '망치 끝이 미세하게 어긋났구먼. 다음은 잡힐 거야',
    down: '내 평생 망치질이 이렇게 무거운 적은 없었네… 하락일세',
  },
  // 7. 손 / 심호흡
  {
    attempting: '심호흡 한 번… 두드린다',
    success: '내 손이 떨릴 정도구나… 완벽한 한 방이었네',
    mega: '심호흡 한 번에 망치가 두 번 떨어졌어 — 한 단계가 더 올랐다',
    hold: '내 잘못이야, 자네 잘못이 아니야. 다시 해보자',
    down: '잠깐 한눈팔았더니… 단계가 무너졌어',
  },
  // 8. 불꽃 / 깊은 곳
  {
    attempting: '망치가 불을 부른다…',
    success: '강철 깊은 곳에서 무언가가 깨어났어',
    mega: '강철 깊은 곳에서 두 번째 울림이 왔다 — 한 단계가 더 깨어났네',
    hold: '오, 거의 다 됐었는데. 다음 망치질에 맡기지',
    down: '쩌적— 이 소리는 못 들은 척하고 싶군',
  },
];
// 확인 모드 문구 — ready(최대 확률)/early(미달) 각 20개.
const CONFIRM_MSGS_READY = [
  '다시 탭하면 망치를 든다',
  '준비 끝났네 — 다시 탭하게',
  '쇠가 달궈졌어. 다시 탭',
  '망치를 들었으니 자네만 신호하게',
  '바로 이 순간이야. 다시 탭하면 시작',
  '대장간이 자네를 기다린다. 다시 탭',
  '한 번 더 — 자네 결정만 남았어',
  '내 손이 근질근질하군. 다시 탭하게',
  '불이 가장 뜨겁다. 지금이 적기야',
  '망치 그림자가 모루 위에 떨어졌네 — 다시 탭',
  '준비 완료. 자네 신호 한 번이면 시작이야',
  '쇠가 노래를 시작했어. 다시 탭하면 합세하지',
  '60년 손맛이 자네를 부른다. 다시 탭',
  '운명의 망치는 두 번 묻지 않아. 한 번 더 탭',
  '담금질이 끝났네. 다시 탭하면 시작',
  '신중함은 좋지만 망치는 식는다. 다시 탭',
  '망치 들었어. 자네만 한 번 더',
  '이 정도면 완벽해. 다시 탭하면 두드린다',
  '용광로가 으르렁댄다 — 다시 탭하게',
  '오늘은 자네 차례 같군. 다시 탭',
] as const;
const CONFIRM_MSGS_EARLY = [
  '쇠가 아직 차네. 더 기다리든지, 다시 탭하면 강행',
  '아직 무르익지 않았어. 그래도 가겠다면 다시 탭',
  '확률이 미약하지만… 자네 결정이야. 다시 탭',
  '서두르는군. 자네 의지면 다시 탭',
  '운명을 시험할 텐가? 다시 탭',
  '망치가 무거워질 텐데, 그래도 다시 탭이면 두드리지',
  '아직 적기가 아닐세. 확신이면 다시 탭',
  '한 호흡 더 기다리면 더 좋네… 그래도 다시 탭이면 시작',
  '용광로가 미지근해. 무릅쓰겠나? 다시 탭',
  '나라면 좀 더 기다리겠어. 그래도 다시 탭하면 가지',
  '운에 맡기겠다는 거지? 다시 탭하게',
  '내 손이 떨릴까 두려운데… 다시 탭이면 가지',
  '쇠가 충분히 안 달궈졌어. 그래도 다시 탭',
  '강행은 비싸게 먹힌다네. 그래도 다시 탭',
  '망치가 가벼워. 자네 의지면 다시 탭',
  '아직 별이 안 떴어. 그래도 다시 탭하면 두드린다',
  '서두를 텐가, 신중할 텐가? 자네 선택, 다시 탭',
  '확률이 낮네. 그래도 가겠다면 다시 탭',
  '대장간이 한 박자 쉬자 하는군. 그래도 다시 탭이면 가지',
  '오늘은 운이 한 번 외출한 듯해. 그래도 다시 탭',
] as const;
function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}
const OUTCOME_TONE: Record<Outcome, string> = {
  success: 'text-emerald-300',
  mega: 'text-amber-200',
  hold: 'text-zinc-200',
  down: 'text-amber-300',
};
const FLASH_CLASS: Record<Outcome, string> = {
  success: 'animate-flash-success',
  mega: 'animate-flash-success',
  hold: 'animate-flash-hold',
  down: 'animate-flash-down',
};
// 자동 강화 오버레이 좌측 +N — EnhanceFX 각 결과 카운터와 동일한 색/글로우(클래스 원문 복제).
const AUTO_NUM_CLASS: Record<Outcome, string> = {
  success: 'text-emerald-100 drop-shadow-[0_0_8px_rgba(52,211,153,0.9)]',
  mega: 'text-yellow-100 drop-shadow-[0_0_10px_rgba(253,224,71,0.95)]',
  hold: 'text-zinc-100 drop-shadow-[0_0_8px_rgba(161,161,170,0.9)]',
  down: 'text-red-100 drop-shadow-[0_0_8px_rgba(239,68,68,0.9)]',
};

function fmtRemaining(ms: number): string {
  if (ms <= 0) return '완료';
  const s = Math.ceil(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0 ? `${h}시간 ${m}분` : m > 0 ? `${m}분 ${sec}초` : `${sec}초`;
}
// 경과시간(자동 강화 소요) — 0초부터 표기(fmtRemaining은 0을 '완료'로 처리해 부적합).
function fmtDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0 ? `${h}시간 ${m}분` : m > 0 ? `${m}분 ${sec}초` : `${sec}초`;
}

export function EnhanceSlotCard({
  activeJob: propJob,
  diamond,
}: {
  activeJob: ActiveJob;
  diamond: string;
}) {
  // 자동 재등록된 다음 잡을 응답 즉시 반영하는 오버라이드(2026-07-23 Eclipse 제보 근본 수정).
  // 서버는 강화 수령 시 새 잡을 이미 만들지만, 종전엔 router.refresh(연출 2.5초 뒤)로만 반영돼
  // 네트워크 지연 시 완료된 옛 잡이 게이지 100%로 잔류 → 재수령이 확률 0%대 새 잡에 꽂혔다.
  // finalize 응답의 nextJob으로 즉시 교체하고, prop이 그 잡(또는 이후)으로 갱신되면 해제한다.
  const [jobOverride, setJobOverride] = useState<ActiveJob | null>(null);
  const activeJob = jobOverride ?? propJob;
  const router = useRouter();
  const { showRanking, beginEnhanceOverlay, endEnhanceOverlay, showError } = useResourceToast();
  const { optimisticAdjust: adjustDiamond } = useDiamond();
  const [pending, startTransition] = useTransition();
  const [nowMs, setNowMs] = useState(0); // SSR 매칭 위해 0 → mount 후 동기화
  const [confirm, setConfirm] = useState(false);
  const [confirmLeft, setConfirmLeft] = useState(0); // 확인 카운트다운(초). 0=비활성/만료.
  const [flash, setFlash] = useState<Outcome | null>(null);
  const [flashFromLevel, setFlashFromLevel] = useState<number | null>(null); // 결과 직전 레벨(보간 시작)
  const [flashToLevel, setFlashToLevel] = useState<number | null>(null); // 결과 후 새 레벨(보간 종료)
  const [optimisticDone, setOptimisticDone] = useState(false);
  const [confirmReduce, setConfirmReduce] = useState(false);
  const [confirmReduceLeft, setConfirmReduceLeft] = useState(0);
  const [flashMsg, setFlashMsg] = useState<string | null>(null); // outcome 랜덤 메시지
  const [confirmMsg, setConfirmMsg] = useState<string | null>(null); // 확인 랜덤 메시지
  const [attempting, setAttempting] = useState(false); // 강화 시도 중(취소/단축 제외)
  const [attemptingMsg, setAttemptingMsg] = useState<string | null>(null);

  // ── 자동 강화(경제 sink Phase 0 · 액티브 전용 A) ─────────────────────────────
  const autoRunRef = useRef(false);
  const autoJobRef = useRef('');
  const autoBudgetRef = useRef(0);
  const autoCfgRef = useRef<{ target: number | null; count: number | null; down: boolean }>({
    target: null,
    count: null,
    down: false,
  });
  const [autoOpen, setAutoOpen] = useState(false); // 설정 모달
  const [autoBudget, setAutoBudget] = useState('5000');
  const [autoUseTarget, setAutoUseTarget] = useState(true);
  const [autoTarget, setAutoTarget] = useState('');
  const [autoUseCount, setAutoUseCount] = useState(false);
  const [autoCount, setAutoCount] = useState('50');
  const [autoDownStop, setAutoDownStop] = useState(false);
  // 진행 중엔 실제 강화 FX(playResult)를 재생하고, 그 위에 자동 강화 오버레이(좌우 2단)를 덮는다.
  // startMs·정지조건을 통계에 담아 렌더에서 계산(ref를 렌더에서 읽지 않도록).
  type AutoStats = {
    attempts: number; gems: number; ok: number; hold: number; down: number;
    startLv: number; curLv: number; startMs: number;
    budgetTotal: number; target: number | null; countLimit: number | null; downStop: boolean;
  };
  const [autoRunning, setAutoRunning] = useState(false);
  const [autoStats, setAutoStats] = useState<AutoStats | null>(null); // 진행중 오버레이(실시간 누적)
  const [autoResult, setAutoResult] = useState<(AutoStats & { elapsedMs: number; reason: string }) | null>(null); // 완료 오버레이(인메모리)
  const [autoStopConfirm, setAutoStopConfirm] = useState(false); // 진행 오버레이 탭 → 중지 재확인(3s)
  const [autoStopLeft, setAutoStopLeft] = useState(0);
  const [cancelOpen, setCancelOpen] = useState(false); // 취소(강화 해제) 확인 모달

  useEffect(() => {
    setNowMs(Date.now());
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    setOptimisticDone(false);
    setConfirm(false);
  }, [activeJob.jobId]);
  // prop이 오버라이드한 잡(또는 그 이후)으로 갱신되면 오버라이드 해제 — 이후 서버 데이터 신뢰.
  useEffect(() => {
    if (jobOverride && propJob.jobId === jobOverride.jobId) setJobOverride(null);
  }, [propJob.jobId, jobOverride]);
  // 게이지 transition 토글 — 페이지 진입(초기) + 새 잡 도착(시도 후 게이지 점프) 시
  // 첫 paint는 transition 끔(즉시 그 자리). 다음 frame부터 켜서 매초 흐름 · 보석 단축은
  // 부드럽게(700ms). 두 단계 rAF로 React commit + 브라우저 paint 후 클래스 추가.
  const [animGauge, setAnimGauge] = useState(false);
  useEffect(() => {
    setAnimGauge(false);
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => setAnimGauge(true));
    });
    return () => {
      cancelAnimationFrame(raf1);
      if (raf2) cancelAnimationFrame(raf2);
    };
  }, [activeJob.jobId]);
  // 확인 모드 진입 시 3초 카운트다운 + 랜덤 메시지 선택(client-only — SSR 안전).
  useEffect(() => {
    if (!confirm) {
      setConfirmLeft(0);
      setConfirmMsg(null);
      return;
    }
    setConfirmLeft(3);
    setConfirmMsg(pick(ready ? CONFIRM_MSGS_READY : CONFIRM_MSGS_EARLY));
    const id = setInterval(() => {
      setConfirmLeft((s) => {
        if (s <= 1) {
          setConfirm(false);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(id);
    // ready를 deps에 안 넣음 — 진입 시점의 ready 메시지를 카운트 동안 고정(자연).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [confirm]);
  // 다이아 단축 — 3s 재탭 패턴(카운트 라벨 노출용 useEffect). 취소는 코너 X + 공용 확인 모달로 분리.
  useEffect(() => {
    if (!confirmReduce) {
      setConfirmReduceLeft(0);
      return;
    }
    setConfirmReduceLeft(3);
    const id = setInterval(() => {
      setConfirmReduceLeft((s) => {
        if (s <= 1) {
          setConfirmReduce(false);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [confirmReduce]);
  // 자동 진행 오버레이 탭 → 중지 재확인(3s 재탭 패턴, 강화 시도 확인과 동일).
  useEffect(() => {
    if (!autoStopConfirm) {
      setAutoStopLeft(0);
      return;
    }
    setAutoStopLeft(3);
    const id = setInterval(() => {
      setAutoStopLeft((s) => {
        if (s <= 1) {
          setAutoStopConfirm(false);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [autoStopConfirm]);

  const startMs = new Date(activeJob.startedAtIso).getTime();
  const endMs = new Date(activeJob.completeAtIso).getTime();
  const totalMs = Math.max(1, endMs - startMs);
  const done = optimisticDone;
  const elapsedMs = done ? totalMs : Math.max(0, Math.min(totalMs, nowMs - startMs));
  const progress = done ? 1 : nowMs === 0 ? 0 : elapsedMs / totalMs;
  const remainingMs = done ? 0 : Math.max(0, endMs - nowMs);
  const ready = progress >= 1;

  // 4분기 outcome 확률(BALANCE §1.2) — 사이클 내 ℓ 기준. down은 시간 무관 고정.
  // UI '성공'은 +1·+2 모두 포함(success + mega) — 시간 꽉 차면 '최대'(baseRate)와 일치.
  const fixedDownBp = downRateBp(activeJob.fromLevel);
  const probs = effectiveOutcomeProbsBp(activeJob.baseRateBp, fixedDownBp, elapsedMs, totalMs);
  const effBp = probs.success + probs.mega;
  const isRiskZone = fixedDownBp > 0;
  const downPct = probs.down / 100;

  const instantCost = remainingMs > 0 ? diamondToFinishMs(remainingMs) : 0;
  const canAfford = BigInt(diamond) >= BigInt(instantCost || 0);

  // 자동 재등록된 다음 잡을 즉시 반영 — 불변 필드(장비 정체성)는 현재 카드에서 유지, 변동 필드만 교체.
  // router.refresh 도착 전이라도 게이지가 새 잡 기준(0%)으로 바로 리셋된다.
  type NextJob = {
    jobId: string;
    fromLevel: number;
    targetLevel: number;
    baseRateBp: number;
    startedAtIso: string;
    completeAtIso: string;
  };
  const applyNextJob = (nj: NextJob | null | undefined) => {
    if (!nj) return;
    setJobOverride({
      ...activeJob,
      jobId: nj.jobId,
      fromLevel: nj.fromLevel,
      targetLevel: nj.targetLevel,
      baseRateBp: nj.baseRateBp,
      startedAtIso: nj.startedAtIso,
      completeAtIso: nj.completeAtIso,
    });
  };

  // 결과 연출 재생 — 정상 응답·복구 조회 공용(2026-07-21 분리).
  const playResult = (oc: Outcome, fromLv: number, toLv: number, lore: (typeof LORE_SETS)[number]) => {
    beginEnhanceOverlay();
    setAttempting(false);

    const reduceMotion =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    if (oc === 'mega') {
      // 메가(+2) — 2단계 연출. Phase 1: 일반 성공 +1, Phase 2: 보너스 +1.
      setFlash('success');
      setFlashFromLevel(fromLv);
      setFlashToLevel(fromLv + 1);
      setFlashMsg(lore.success);
      sounds.enhanceSuccess(); // Phase 1 — 성공음
      if (!reduceMotion && typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        navigator.vibrate(30); // Phase 1 — success 햅틱
      }
      // Phase 2 — 1.4s 후 메가 추가.
      setTimeout(() => {
        setFlash('mega');
        setFlashFromLevel(fromLv + 1);
        setFlashToLevel(toLv);
        setFlashMsg(lore.mega ?? lore.success);
        sounds.enhanceJackpot(); // Phase 2 — 대박(메가) 팡파레
        if (!reduceMotion && typeof navigator !== 'undefined' && 'vibrate' in navigator) {
          navigator.vibrate([0, 50, 80, 50, 80, 100]); // mega 햅틱
        }
      }, 1400);
      // 종료 — Phase 2 표시 후 총 3.9s(2026-05-31 사용자 결정: 0.5s 단축).
      setTimeout(() => {
        setFlash(null);
        setFlashMsg(null);
        setFlashFromLevel(null);
        setFlashToLevel(null);
        endEnhanceOverlay(); // 오버레이 종료 → 활성 0이면 랭킹 토스트 노출
        // router.refresh() 제거(2026-07-23) — finalizeEnhance의 revalidatePath가 이미 헤더(layout)
        // ·레벨·전투력을 응답으로 갱신하고, 게이지는 applyNextJob이 반영. 별도 GET RSC refetch는
        // 중복이라 수령 1회당 페이지 렌더가 2→1로 줄어든다(실측 검증).
      }, 3900);
    } else {
      setFlash(oc);
      setFlashFromLevel(fromLv);
      setFlashToLevel(toLv);
      setFlashMsg(lore[oc] ?? lore.success);
      // 결과음 — reduceMotion과 무관(소리는 모션 감소 대상 아님).
      if (oc === 'success') sounds.enhanceSuccess();
      else if (oc === 'down') sounds.enhanceDown();
      else sounds.enhanceKeep(); // hold(유지)
      if (!reduceMotion && typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        if (oc === 'success') navigator.vibrate(30);
        else if (oc === 'down') navigator.vibrate([0, 30, 50, 30]);
        // hold: 무음
      }
      setTimeout(() => {
        setFlash(null);
        setFlashMsg(null);
        setFlashFromLevel(null);
        setFlashToLevel(null);
        endEnhanceOverlay(); // 오버레이 종료 → 활성 0이면 랭킹 토스트 노출
        // router.refresh() 제거(2026-07-23, 위 mega 분기와 동일 근거) — revalidatePath 중복 제거.
      }, 2500);
    }
  };

  const doAttempt = () => {
    if (pending) return;
    // 세트 랜덤 — 시도/결과(success/hold/down)가 같은 컨셉을 공유(맥락 유지).
    const idx = Math.floor(Math.random() * LORE_SETS.length);
    const lore = LORE_SETS[idx]!;
    setConfirm(false);
    setAttempting(true);
    setAttemptingMsg(lore.attempting);
    startTransition(async () => {
      // 결과 트랜잭션 커밋 즉시 반환(후처리는 서버 after). 이 await만 pending.
      // 전송 실패(풀러 타임아웃·오프라인 등)로 reject되면 아래 분기에 도달 못해 attempting이
      // 고착된다 — .catch로 잡아 낙관 상태를 되돌리고 재시도 안내(doCancel과 동일 방어).
      const r = await finalizeEnhance(activeJob.jobId).catch(() => null);
      if (!r) {
        // 응답 유실 ≠ 판정 실패(2026-07-21 공포님 제보) — 배포 스큐·모바일 복귀 직후엔
        // 서버 판정은 커밋됐는데 응답만 못 받는 케이스가 실재. 순수 JSON 라우트(스큐 면역)로
        // 결과를 되찾아 정상 연출을 재생하고, 못 찾으면 상태 재동기화로 강등.
        const rec = await fetch(`/api/enhance/outcome?job=${activeJob.jobId}`, { cache: 'no-store' })
          .then((res) => (res.ok ? (res.json() as Promise<{ state: string; outcome?: string; fromLevel?: number; toLevel?: number; nextJob?: NextJob | null }>) : null))
          .catch(() => null);
        if (rec?.state === 'done' && rec.outcome) {
          applyNextJob(rec.nextJob); // 게이지 즉시 리셋(옛 잡 100% 잔류 방지)
          playResult(rec.outcome as Outcome, Number(rec.fromLevel), Number(rec.toLevel), lore);
          return;
        }
        setAttempting(false);
        if (rec?.state === 'pending') {
          // 액션이 실행되지 않음(순수 네트워크 실패) — 재시도 안전.
          showError('전송에 실패했어요. 연결을 확인하고 다시 시도해 주세요.');
          return;
        }
        showError('연결이 불안정해 결과 표시에 실패했어요. 최신 상태로 다시 불러옵니다.');
        router.refresh();
        return;
      }
      if (r.status === 'error') {
        setAttempting(false);
        showError(r.message);
        // 유령 카드 해소 — cron/다른 탭이 먼저 정산해 잡이 사라졌으면(JOB_NOT_FOUND) 이
        // 카드는 스테일. 서버 재동기화로 걷어내지 않으면 재탭마다 같은 토스트만 반복된다.
        if (r.code === 'JOB_NOT_FOUND') router.refresh();
        return;
      }
      // 튜토리얼: 첫 강화 시도 완료 신호(코치가 attempt 단계일 때만 마무리 팝업).
      completeTutorial();
      // 강화 결과 토스트 — 누적(last-wins)만 하고, 결과 오버레이 종료 시 노출.
      // 이 슬롯 오버레이 시작 신호(begin) → 종료 setTimeout에서 end → 모든 슬롯 0이면 토스트.
      showRanking(r.ranksBefore, r.ranksAfter);
      applyNextJob(r.nextJob); // 게이지 즉시 리셋 — router.refresh 지연과 무관하게 새 잡 반영
      playResult(r.result.outcome as Outcome, Number(r.result.fromLevel), Number(r.result.toLevel), lore);
    });
  };

  const doReduce = () => {
    // 등록 확정 전(낙관적 잡)엔 보석 단축 불가 — 임시 id가 서버 BigInt로 새어 크래시하던 것 방지.
    if (pending || !instantCost || !canAfford || activeJob.jobId.startsWith('optimistic-')) return;
    // 다이아 사용 — 취소와 동일 3s 재탭 패턴(오탭 보호). 카운트다운은 useEffect.
    if (!confirmReduce) {
      setConfirmReduce(true);
      return;
    }
    setConfirmReduce(false);
    setOptimisticDone(true);
    // 헤더 다이아 즉시 차감(낙관). 실패 시 롤백.
    const debit = BigInt(instantCost);
    adjustDiamond(-debit);
    startTransition(async () => {
      // 전송 실패(reject)로 아래 분기에 도달 못하면 낙관 차감이 안 되돌려져 헤더 다이아가
      // 실제보다 낮게 굳는다 — .catch로 잡아 롤백(에러 반환 케이스와 동일).
      const r = await reduceTimeWithGems(activeJob.jobId, instantCost).catch(() => null);
      if (!r) {
        setOptimisticDone(false);
        adjustDiamond(debit); // 전송 실패 롤백(실행됐다면 아래 refresh가 실차감 반영)
        showError('연결이 불안정해요. 최신 상태로 다시 불러옵니다.');
        // 응답 유실 시 서버는 이미 단축됐을 수 있음 — 재동기화로 실제 상태 표시(이중 결제 방지).
        router.refresh();
        return;
      }
      if (r.status === 'error') {
        setOptimisticDone(false);
        adjustDiamond(debit); // 롤백
        showError(r.message);
      } else router.refresh();
    });
  };

  const [optimisticCancelled, setOptimisticCancelled] = useState(false);
  // 실제 취소 실행 — 확인은 공용 모달(cancelOpen)에서 이미 받음. 코너 X → 모달 → 이 함수.
  const doCancel = () => {
    // 등록 확정 전(낙관적 잡)엔 취소 불가 — 임시 id가 서버 BigInt로 새는 것 방지(등록 완료 후 취소).
    if (attempting || activeJob.jobId.startsWith('optimistic-')) return;
    setCancelOpen(false);
    setOptimisticCancelled(true); // 카드 즉시 숨김 — 처리중 표시 X
    void cancelEnhanceAction(activeJob.jobId)
      .then((r) => {
        if (r.status === 'error') {
          setOptimisticCancelled(false);
          showError(r.message);
        } else {
          router.refresh();
        }
      })
      .catch(() => {
        // 전송 실패(오프라인 등) — 서버엔 잡이 살아있는데 placeholder로 굳으면 슬롯이 죽는다.
        // 응답 유실이면 취소는 이미 처리됐을 수 있음 — 재동기화로 실제 상태 표시.
        setOptimisticCancelled(false);
        showError('연결이 불안정해요. 최신 상태로 다시 불러옵니다.');
        router.refresh();
      });
  };

  // 자동 강화 — 클라 구동 루프. 매 스텝 서버 권위(autoEnhanceStepAction): 💎로 완료 단축→판정→재등록.
  // 연출은 수동 강화와 동일한 playResult(FX·로어·게이지) 위에 자동 강화 오버레이(누적 통계)를 덮는다.
  // 이탈/멈춤 = 루프 중단. 세션 끝에 결과 오버레이 노출.
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const autoReasonText = (r: string) =>
    r === 'budget' ? '예산 소진' : r === 'insufficient' ? '다이아 부족' : r === 'gone' ? '강화 종료' : r;
  const finishAuto = (stats: AutoStats, reason: string, isError = false) => {
    autoRunRef.current = false;
    setAutoRunning(false);
    setAutoStats(null);
    setAutoStopConfirm(false);
    setAttempting(false);
    const elapsedMs = Math.max(0, Date.now() - stats.startMs);
    setAutoResult({ ...stats, elapsedMs, reason });
    if (isError) showError(reason);
    router.refresh(); // 세션 종료 시 1회 — 권위 다이아·레벨·전투력 재동기화(스텝마다 X)
  };
  const runAutoLoop = async () => {
    let attempts = 0, gems = 0, ok = 0, hold = 0, down = 0;
    const startLv = activeJob.fromLevel;
    const startMs = Date.now();
    let curLv = startLv;
    const cfg = autoCfgRef.current; // 세션 고정 정지조건 — 오버레이 표기 + 정지 판정 공용.
    const budgetTotal = autoBudgetRef.current; // 루프 시작 시점 = 전체 예산(이후 차감됨).
    const snap = (): AutoStats => ({ attempts, gems, ok, hold, down, startLv, curLv, startMs, budgetTotal, target: cfg.target, countLimit: cfg.count, downStop: cfg.down });
    setAutoStats(snap());
    while (autoRunRef.current) {
      // 수동 시도와 동일: 세트 랜덤 → 시도 오버레이 → 서버 스텝 → 결과 FX.
      const lore = LORE_SETS[Math.floor(Math.random() * LORE_SETS.length)]!;
      setAttempting(true);
      setAttemptingMsg(lore.attempting);
      const r = await autoEnhanceStepAction(autoJobRef.current, autoBudgetRef.current).catch(() => null);
      if (!autoRunRef.current) { setAttempting(false); break; } // 응답 도착 전 멈춤/이탈
      if (!r) return finishAuto(snap(), '연결이 불안정해 자동 강화를 멈췄어요.', true);
      if (r.status === 'error') return finishAuto(snap(), r.message, true);
      if (r.status === 'stop') {
        // budget/insufficient/gone — 정상 정지(오류 아님). 마지막 잔여 잡은 자연시간 진행.
        return finishAuto(snap(), autoReasonText(r.reason));
      }
      // status === 'ok' — 서버가 이미 💎 차감·판정·재등록 완료.
      attempts++;
      gems += r.gemsSpent;
      autoBudgetRef.current -= r.gemsSpent;
      if (r.gemsSpent > 0) adjustDiamond(-BigInt(r.gemsSpent)); // 헤더 다이아 낙관 차감
      if (r.outcome === 'success' || r.outcome === 'mega') ok++;
      else if (r.outcome === 'hold') hold++;
      else down++;
      curLv = Number(r.toLevel);
      autoJobRef.current = r.nextJob ? r.nextJob.jobId : autoJobRef.current;
      applyNextJob(r.nextJob); // 게이지 즉시 새 잡으로(수동 경로와 동일)
      setAutoStats(snap()); // 진행 오버레이 실시간 갱신
      // 실제 강화 연출 재생(오버레이 아래) — 재생 시간만큼 대기(멈춤은 다음 스텝 진입 시 반영).
      playResult(r.outcome as Outcome, Number(r.fromLevel), Number(r.toLevel), lore);
      await sleep(r.outcome === 'mega' ? 4000 : 2600);
      if (!autoRunRef.current) break;
      // 정지조건 판정(cfg는 루프 상단에서 캡처).
      if (cfg.down && r.outcome === 'down') return finishAuto(snap(), '하락 발생으로 정지');
      if (cfg.target != null && curLv >= cfg.target) return finishAuto(snap(), '목표 레벨 도달');
      if (cfg.count != null && attempts >= cfg.count) return finishAuto(snap(), '설정 횟수 도달');
      if (!r.nextJob) return finishAuto(snap(), '최대 레벨 도달');
      if (autoBudgetRef.current <= 0) return finishAuto(snap(), '예산 소진');
    }
    finishAuto(snap(), '멈춤'); // 루프 탈출(멈춤/이탈)
  };
  const startAuto = () => {
    if (pending || attempting || flash || autoResult || activeJob.jobId.startsWith('optimistic-')) return;
    const bal = Number(diamond) || 0;
    if (bal < 1) { showError('보유 다이아가 없어 자동 강화를 시작할 수 없어요.'); return; }
    let b = parseInt(autoBudget, 10) || 0;
    if (b < 1) { showError('다이아 예산을 입력하세요.'); return; }
    // 예산은 보유량을 넘지 못함(넘겨도 서버 walletTrySpend가 insufficient로 안전 정지하지만 UX상 캡).
    // 시작 후 다른 이유로 보유가 예산 밑으로 줄어도 서버가 'insufficient' → 정상 정지.
    if (b > bal) b = bal;
    autoRunRef.current = true;
    autoJobRef.current = activeJob.jobId;
    autoBudgetRef.current = b;
    autoCfgRef.current = {
      target: autoUseTarget ? parseInt(autoTarget, 10) || null : null,
      count: autoUseCount ? parseInt(autoCount, 10) || null : null,
      down: autoDownStop,
    };
    setAutoOpen(false);
    setAutoResult(null);
    setAutoStopConfirm(false);
    setAutoRunning(true);
    void runAutoLoop();
  };
  // 목표 레벨/횟수 ± 조정(스텝 1) — 목표는 현재 강화수치 초과로, 횟수는 1 이상으로 클램프.
  const bumpTarget = (delta: number) => {
    const minLv = activeJob.fromLevel + 1;
    const cur = parseInt(autoTarget, 10) || minLv;
    setAutoTarget(String(Math.max(minLv, cur + delta)));
  };
  const bumpCount = (delta: number) => {
    const cur = parseInt(autoCount, 10) || 1;
    setAutoCount(String(Math.max(1, cur + delta)));
  };
  // 이탈/언마운트 = 자동 정지(루프만 중단). pagehide=탭 닫힘/이동, cleanup=SPA 언마운트.
  useEffect(() => {
    const stop = () => { autoRunRef.current = false; };
    window.addEventListener('pagehide', stop);
    return () => { window.removeEventListener('pagehide', stop); autoRunRef.current = false; };
  }, []);
  // 자동 강화 중 화면 꺼짐(절전) 방지 — Screen Wake Lock. 지원 브라우저(iOS16.4+·Android Chrome)에서만
  // 동작(미지원은 무시). 탭이 백그라운드로 가면 OS가 락을 강제 해제하므로 visibilitychange로 재획득.
  useEffect(() => {
    if (!autoRunning) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const nav = navigator as any;
    if (!nav.wakeLock?.request) return; // 미지원 → 무시(자동 강화는 정상 동작, 화면만 꺼질 수 있음)
    let lock: { release: () => Promise<void>; released?: boolean } | null = null;
    let cancelled = false;
    const acquire = async () => {
      try {
        const l = await nav.wakeLock.request('screen');
        if (cancelled) { void l.release(); return; }
        lock = l;
      } catch {
        /* 사용자 제스처 밖·배터리 절약 등으로 거부될 수 있음 — 무시 */
      }
    };
    const onVis = () => { if (document.visibilityState === 'visible') void acquire(); };
    void acquire();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVis);
      if (lock && !lock.released) void lock.release().catch(() => {});
    };
  }, [autoRunning]);

  // 자동 강화 오버레이 우측 칩(진행/결과 공용) — 각 정보 1회만: 예산=사용/총, 시도=횟수칩(제한 시)
  // 또는 '시도'(무제한), 목표=현재/목표, 결과=성공·유지·실패(+하락정지). 켠 조건만.
  const CHIP = 'w-max rounded border border-zinc-700 bg-black/70 px-1.5 py-px text-[9px] text-zinc-300 tabular-nums';
  const autoRight = (s: AutoStats) => {
    const mid: string[] = [];
    if (s.target != null) mid.push(`목표 +${s.curLv}/${s.target}`);
    mid.push(s.countLimit != null ? `횟수 ${s.attempts}/${s.countLimit}` : `시도 ${s.attempts}`);
    return (
      <>
        <span className={CHIP}>
          예산 <span className="text-amber-300">{s.gems.toLocaleString()}</span>/{s.budgetTotal.toLocaleString()}
        </span>
        <span className={CHIP}>{mid.join(' · ')}</span>
        <span className={CHIP}>
          <span className="text-emerald-300">성공 {s.ok}</span> <span className="text-zinc-400">유지 {s.hold}</span>{' '}
          <span className="text-amber-300">실패 {s.down}</span>
          {s.downStop ? <span className="text-blue-300"> · 하락정지</span> : null}
        </span>
      </>
    );
  };

  // 보석 단축 3초 컨펌 중에는 슬롯의 다른 영역(강화 시도) 클릭 불가 — 오탭/혼선 방지.
  const otherActionConfirm = confirmReduce;

  if (optimisticCancelled) {
    // 카드를 picker와 동일 외관의 placeholder로 즉시 교체 — 슬롯 2칸 유지.
    // router.refresh() 후 부모 page가 실제 EmptySlotButton(후보 모달 가능)으로 교체.
    const slotLabel: Record<Slot, string> = { weapon: '무기', armor: '방어구', accessory: '장신구' };
    return (
      <div className="flex h-[92px] w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-zinc-700 text-sm text-zinc-500">
        <span className="text-lg">＋</span> {slotLabel[activeJob.slot]} 올려 강화
      </div>
    );
  }

  return (
    <div className="relative">
      <div
        role="button"
        data-tut={confirm ? 'enhance-confirm' : 'enhance-attempt'}
        tabIndex={pending ? -1 : 0}
        aria-label={`강화 시도 — 현재 성공률 ${(effBp / 100).toFixed(1)}%`}
        onClick={() => {
          if (pending || flash || otherActionConfirm || autoRunning || autoResult) return; // 컨펌·자동 진행/결과 중엔 시도 영역 잠금
          // 확인 모드: 두 번째 탭 = 강화. 그 외(기본): 첫 탭 = 확인 진입.
          if (confirm) doAttempt();
          else setConfirm(true);
        }}
        onKeyDown={(e) => {
          if ((e.key === 'Enter' || e.key === ' ') && !pending && !flash && !otherActionConfirm) {
            e.preventDefault();
            if (confirm) doAttempt();
            else setConfirm(true);
          }
        }}
        className={`relative h-[92px] cursor-pointer isolate overflow-hidden rounded-xl border-2 bg-zinc-950 text-zinc-100 transition active:scale-[0.99] ${
          ready ? 'border-emerald-500' : 'border-zinc-700'
        } ${flash ? FLASH_CLASS[flash] : ''}`}
      >
        {/* 진행 게이지 — 하단 바. 색: <50% 빨강 / 50~<100% 주황 / 100% 초록.
            transition은 페이지 진입·새 잡 도착 직후엔 끔(즉시 표시), 이후 매초 채워질
            때 · 보석 단축 시만 켬(animGauge). */}
        <div
          className={`absolute bottom-[-1px] left-0 h-1 ${
            animGauge ? 'transition-[width] duration-700' : ''
          } ${ready ? 'bg-emerald-400' : progress >= 0.5 ? 'bg-orange-400' : 'bg-red-500'}`}
          style={{ width: `${Math.max(2, Math.round(progress * 1000) / 10)}%` }}
        />
        <div className="relative z-10 flex h-full items-center gap-3 px-3">
          <span
            className={`relative flex h-16 w-16 shrink-0 items-center justify-center isolate overflow-hidden rounded-lg border bg-black/40 ${
              hasRarityBorder(activeJob.transcendLevel) ? '' : 'border-zinc-700'
            }`}
            style={rarityBorderStyle(activeJob.transcendLevel)}
          >
            <RarityFrame level={activeJob.transcendLevel} />
            <TranscendSprite
              code={activeJob.code}
              slot={activeJob.slot}
              level={activeJob.transcendLevel}
              championRank={activeJob.championRank}
              size={60}
              frameless
            />
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-0.5 overflow-hidden">
            {/* 1줄: 이름 + ✦라벨 — 수직 중앙정렬(flex items-center). 이름은 자연 wrap(잘림 없음,
                break-keep), ✦라벨은 등급 색상으로 이름 옆 수직 중앙에 붙음. */}
            <div className="flex items-center gap-1.5 text-sm font-bold leading-tight">
              <span className="min-w-0 break-keep">{activeJob.name}</span>
              <span
                className="shrink-0 text-[10px] font-bold tabular-nums"
                style={{
                  color: `rgb(${transcendStyle(activeJob.transcendLevel).colorRgb.join(',')})`,
                }}
              >
                ✦{activeJob.transcendLevel}
              </span>
            </div>
            {/* 2줄: 확률 — 짧으니 잘릴 일 없음. */}
            <div className="flex gap-2 text-[11px] font-semibold tabular-nums whitespace-nowrap">
              <span className="text-emerald-300">성공 {(effBp / 100).toFixed(1)}%</span>
              <span className="text-zinc-500">최대 {(activeJob.baseRateBp / 100).toFixed(1)}%</span>
              {isRiskZone ? (
                <span className="text-amber-300">하락 {downPct.toFixed(1)}%</span>
              ) : null}
            </div>
            {/* 3줄: 강화 단계(+N→+M) + 시간 안내. 강화 단계는 진한 톤으로 강조. */}
            <div className="flex gap-2 text-[10px] text-zinc-400 tabular-nums whitespace-nowrap">
              <span className="font-semibold text-zinc-200">
                +{activeJob.fromLevel}→+{activeJob.targetLevel}
              </span>
              <span>
                {attempting
                  ? '처리 중…'
                  : ready
                    ? '강화 가능 (최대 확률)'
                    : `최대 확률까지 ${fmtRemaining(remainingMs)}`}
              </span>
            </div>
          </div>
          <div className="flex shrink-0 flex-col gap-1">
            <button
              type="button"
              disabled={
                pending ||
                !instantCost ||
                !canAfford ||
                confirm ||
                attempting ||
                !!flash ||
                autoRunning
              }
              onClick={(e) => {
                e.stopPropagation();
                doReduce();
              }}
              className={`h-6 w-[54px] rounded-md border text-[9px] font-bold tabular-nums disabled:opacity-40 ${
                confirmReduce
                  ? 'animate-pulse border-amber-300 bg-amber-500 text-white'
                  : 'border-zinc-600 bg-zinc-800/60 text-amber-200'
              }`}
            >
              {confirmReduce
                ? `확인 ${confirmReduceLeft}s`
                : instantCost
                  ? `💎${instantCost}`
                  : '완료'}
            </button>
            {/* 자동 — 강조 없이 단축 버튼과 동일 UI(사용자 피드백 2). */}
            <button
              type="button"
              disabled={pending || confirm || confirmReduce || attempting || !!flash || autoRunning || activeJob.jobId.startsWith('optimistic-')}
              onClick={(e) => {
                e.stopPropagation();
                if (activeJob.jobId.startsWith('optimistic-')) return;
                setAutoTarget(String(activeJob.fromLevel + 10));
                setAutoBudget(String(Math.min(5000, Number(diamond) || 0))); // 기본 예산 = min(5000, 보유)
                setAutoOpen(true);
              }}
              className="h-6 w-[54px] rounded-md border border-zinc-600 bg-zinc-800/60 text-[9px] font-bold text-zinc-200 disabled:opacity-40"
            >
              ⚙️자동
            </button>
          </div>
        </div>

        {/* 취소(X) — 좌상단(스프라이트 위 모서리). 우측 버튼열과 겹치지 않도록 분리(사용자 피드백 1).
            자동 진행/결과 중엔 오버레이(z-40)가 덮으므로 노출 안 됨. */}
        <button
          type="button"
          disabled={pending || confirm || confirmReduce || attempting || !!flash || autoRunning || !!autoResult || activeJob.jobId.startsWith('optimistic-')}
          onClick={(e) => {
            e.stopPropagation();
            if (activeJob.jobId.startsWith('optimistic-')) return;
            setCancelOpen(true);
          }}
          className="absolute left-1.5 top-1.5 z-20 flex h-5 w-5 items-center justify-center rounded-md border border-zinc-700 bg-zinc-950/80 text-[11px] leading-none text-zinc-400 backdrop-blur-sm active:scale-95 disabled:opacity-30"
          aria-label="강화 취소"
        >
          ✕
        </button>

        {confirm && !attempting && !flash ? (
          <div className="pointer-events-none absolute inset-0 z-20 flex flex-col items-center justify-center gap-1 bg-black/55 px-4 text-center backdrop-blur-[2px]">
            <span className="relative z-30 rounded bg-black/75 px-2 py-0.5 text-[12px] font-semibold break-keep text-amber-200">
              {confirmMsg ??
                (ready ? '다시 탭하면 강화' : '아직 무르익지 않았다 — 다시 탭하면 강행')}
            </span>
            <span className="relative z-30 rounded bg-black/75 px-2 py-0.5 font-mono text-[10px] text-zinc-300 tabular-nums">
              {confirmLeft}s 후 강화 취소
            </span>
          </div>
        ) : null}

        {attempting && !flash ? (
          <div className="pointer-events-none absolute inset-0 z-20 flex flex-col items-center justify-center gap-1 bg-black/55 px-4 text-center backdrop-blur-[2px]">
            <span className="relative z-30 rounded bg-black/75 px-2 py-0.5 text-[12px] font-semibold break-keep text-amber-200">
              {attemptingMsg ?? '망치가 불을 부른다…'}
            </span>
          </div>
        ) : null}

        {flash ? (
          <>
            {/* 결과 dim — 본 콘텐츠(z-10) 위(z-20), 캐릭터(z-25)·FX(z-30) 뒤. */}
            <span className="pointer-events-none absolute inset-0 z-20 bg-black/55 backdrop-blur-[2px]" />
            {/* FX 시각 레이어 — mega 결과는 success-mega tier(2단계 상승 강조). */}
            <EnhanceFX
              kind={
                flash === 'mega'
                  ? ('success-mega' satisfies FxKind)
                  : (flash satisfies FxKind)
              }
              fromLevel={flashFromLevel ?? activeJob.fromLevel}
              toLevel={flashToLevel ?? activeJob.fromLevel}
            />
            {/* 판타지 톤 메시지 — 최상위(z-30), 모든 FX·dim 위. */}
            <span className="pointer-events-none absolute inset-x-0 bottom-2 z-30 flex items-center justify-center px-5 text-center">
              <span
                className={`rounded bg-black/75 px-2 py-0.5 text-[11px] font-medium break-keep ${OUTCOME_TONE[flash]}`}
              >
                {flashMsg ?? ''}
              </span>
            </span>
          </>
        ) : null}

        {/* 자동 강화 진행 오버레이 — 좌우 2단(B안). 오버레이 탭 → 3s 중지 재확인.
            왼쪽 +N은 강화 결과 FX(FLASH_CLASS·OUTCOME_TONE)와 동일 효과를 그대로 적용. */}
        {autoStats ? (
          <div
            role="button"
            tabIndex={-1}
            onClick={(e) => {
              e.stopPropagation();
              if (autoStopConfirm) { autoRunRef.current = false; setAutoStopConfirm(false); }
              else setAutoStopConfirm(true);
            }}
            className="absolute inset-0 z-40 flex cursor-pointer items-stretch bg-black/60"
          >
            {/* 좌: 현재 강화수치 — 결과 시 EnhanceFX 카운터(CountAnim: 자릿수 롤링·유지 흔들림·
                결과별 글로우)와 동일 이펙트. key로 매 결과(메가 2단계 포함) 재트리거. */}
            <div className="flex flex-[0_0_42%] flex-col items-center justify-center gap-0.5 border-r border-white/10 px-1.5 text-center">
              <span className="text-[9px] font-bold text-amber-300">자동 강화 중</span>
              {flash && flashFromLevel != null && flashToLevel != null ? (
                <CountAnim
                  key={`${flash}-${flashFromLevel}-${flashToLevel}`}
                  from={flashFromLevel}
                  to={flashToLevel}
                  fontSize={22}
                  className={`relative font-bold tabular-nums tracking-tight ${AUTO_NUM_CLASS[flash]}`}
                />
              ) : (
                <span className="text-[22px] font-bold leading-none text-zinc-100 tabular-nums">+{autoStats.curLv}</span>
              )}
              <span className="text-[8.5px] text-zinc-400 tabular-nums">
                시작 +{autoStats.startLv} · {fmtDuration(Math.max(0, nowMs - autoStats.startMs))}
              </span>
            </div>
            {/* 우: 조건·결과 칩 */}
            <div className="flex flex-1 flex-col justify-center gap-1 px-2">
              {autoRight(autoStats)}
            </div>
            {/* 탭 → 중지 재확인 */}
            {autoStopConfirm ? (
              <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-1 bg-black/72 text-center backdrop-blur-[1px]">
                <span className="rounded bg-black/60 px-2 py-0.5 text-[12px] font-bold text-red-200">한 번 더 탭하면 중지</span>
                <span className="font-mono text-[10px] text-zinc-300 tabular-nums">{autoStopLeft}s 후 계속 진행</span>
              </div>
            ) : null}
          </div>
        ) : null}

        {/* 자동 강화 결과 오버레이 — 좌우 2단(진행과 동일 레이아웃, 시프트 없음). 탭하면 닫힘.
            헤더 '자동 강화 완료'는 초록색. */}
        {autoResult ? (
          <div
            role="button"
            tabIndex={-1}
            onClick={(e) => { e.stopPropagation(); setAutoResult(null); }}
            className="absolute inset-0 z-40 flex cursor-pointer items-stretch bg-black/60"
          >
            <div className="flex flex-[0_0_42%] flex-col items-center justify-center gap-0.5 border-r border-white/10 px-1.5 text-center">
              <span className="text-[9px] font-bold text-emerald-400">자동 강화 완료</span>
              <span className="text-[22px] font-extrabold leading-none text-zinc-100 tabular-nums">+{autoResult.curLv}</span>
              <span className="text-[8.5px] text-zinc-400 tabular-nums">
                시작 +{autoResult.startLv} · 총 {fmtDuration(autoResult.elapsedMs)}
              </span>
            </div>
            <div className="flex flex-1 flex-col justify-center gap-1 px-2">
              {autoRight(autoResult)}
            </div>
            <span className="pointer-events-none absolute bottom-1 right-2 text-[8px] text-zinc-500">탭하여 닫기</span>
          </div>
        ) : null}
      </div>

      {/* 자동 강화 설정 모달 — 공용 ModalShell(사용자 피드백 4). */}
      {autoOpen ? (
        <ModalShell
          onClose={() => setAutoOpen(false)}
          label="자동 강화 설정"
          className="w-full max-w-[330px] rounded-2xl border border-zinc-700 bg-zinc-900 p-4"
        >
          {/* 헤더 — 좌측: 인벤토리 목록 타일 그대로(등급 테두리·별장식·스프라이트·이름·+강화 ✦초월),
              우측: 제목 + 설명. */}
          <div className="flex items-start gap-3">
            <span
              className={`relative flex w-[92px] shrink-0 aspect-square flex-col items-center justify-center gap-0.5 isolate overflow-hidden rounded-xl border-2 bg-zinc-950 px-1 text-center ${
                hasRarityBorder(activeJob.transcendLevel) ? '' : 'border-zinc-800'
              }`}
              style={rarityBorderStyle(activeJob.transcendLevel)}
            >
              <RarityFrame level={activeJob.transcendLevel} />
              <TranscendSprite
                code={activeJob.code}
                slot={activeJob.slot}
                level={activeJob.transcendLevel}
                championRank={activeJob.championRank}
                size={48}
                frameless
              />
              <span className="line-clamp-1 break-keep px-0.5 text-[9px] leading-tight text-zinc-400">
                {activeJob.name}
              </span>
              <span className="text-[9px] font-semibold text-zinc-100 tabular-nums">
                +{activeJob.fromLevel}
                <TranscendTag level={activeJob.transcendLevel} className="ml-1" />
              </span>
            </span>
            <div className="min-w-0 flex-1">
              <h3 className="text-sm font-bold text-zinc-100">자동 강화 설정</h3>
              <p className="mt-1 whitespace-pre-line text-[11px] leading-relaxed text-zinc-400">
                {'💎로 시간을 단축하며 자동 반복합니다.\n예산을 다 쓰거나 선택 조건 중 하나라도 달성하면 정지합니다.'}
              </p>
            </div>
          </div>
          {/* 예산 — 필수(체크박스 없음). 라벨 정렬용 체크박스폭 스페이서. 값은 입력창 직접 입력 +
              오른쪽 '최대' 버튼(보유 전액). ± 버튼은 목표/횟수 항목에만(사용자 피드백 2). */}
          <div className="mt-2 flex items-center gap-2 border-t border-zinc-800 py-2.5">
            <span aria-hidden className="h-4 w-4 shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="text-[12px] font-semibold text-zinc-200">다이아 예산</div>
              <div className="text-[10px] text-zinc-500">
                소진 시 정지 · 보유 {(Number(diamond) || 0).toLocaleString()}💎
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <ZoomSafeInput
                wrapClassName="h-8 w-[72px]"
                value={autoBudget}
                onChange={(e) => {
                  const v = e.target.value.replace(/[^0-9]/g, '');
                  const bal = Number(diamond) || 0;
                  setAutoBudget(v === '' ? '' : String(Math.min(parseInt(v, 10), bal))); // 보유 초과 입력 즉시 캡
                }}
                inputMode="numeric"
                className="w-full rounded-md border border-zinc-700 bg-black/40 px-2 text-right font-mono text-zinc-100"
              />
              <button
                type="button"
                onClick={() => setAutoBudget(String(Number(diamond) || 0))}
                className="flex h-8 shrink-0 items-center justify-center rounded-md border border-zinc-700 bg-black/40 px-2 text-[10px] font-bold text-zinc-300 active:scale-95"
              >
                최대
              </button>
            </div>
          </div>
          {/* 목표 레벨 — 선택. 체크박스 토글은 라벨(체크박스+텍스트)까지만, 오른쪽 입력/±은 제외. */}
          <div className="flex items-center gap-2 border-t border-zinc-800 py-2.5">
            <label className="flex min-w-0 flex-1 items-center gap-2">
              <input type="checkbox" checked={autoUseTarget} onChange={(e) => setAutoUseTarget(e.target.checked)} className="h-4 w-4 shrink-0 accent-amber-500" />
              <div className="min-w-0 flex-1">
                <div className="text-[12px] font-semibold text-zinc-200">목표 레벨까지</div>
                <div className="text-[10px] text-zinc-500">선택 · 도달 시 정지</div>
              </div>
            </label>
            <div className="flex shrink-0 items-center gap-1">
              <button type="button" onClick={() => bumpTarget(-1)} disabled={!autoUseTarget} className="flex h-8 w-7 items-center justify-center rounded-md border border-zinc-700 bg-black/40 text-[15px] leading-none text-zinc-300 active:scale-95 disabled:opacity-40" aria-label="목표 레벨 1 감소">−</button>
              <ZoomSafeInput
                wrapClassName="h-8 w-[56px]"
                value={autoTarget}
                onChange={(e) => setAutoTarget(e.target.value.replace(/[^0-9]/g, ''))}
                inputMode="numeric"
                disabled={!autoUseTarget}
                className="w-full rounded-md border border-zinc-700 bg-black/40 px-2 text-center font-mono text-zinc-100 disabled:opacity-40"
              />
              <button type="button" onClick={() => bumpTarget(1)} disabled={!autoUseTarget} className="flex h-8 w-7 items-center justify-center rounded-md border border-zinc-700 bg-black/40 text-[15px] leading-none text-zinc-300 active:scale-95 disabled:opacity-40" aria-label="목표 레벨 1 증가">+</button>
            </div>
          </div>
          {/* 횟수 — 선택. 체크박스 토글은 라벨(체크박스+텍스트)까지만, 오른쪽 입력/±은 제외. */}
          <div className="flex items-center gap-2 border-t border-zinc-800 py-2.5">
            <label className="flex min-w-0 flex-1 items-center gap-2">
              <input type="checkbox" checked={autoUseCount} onChange={(e) => setAutoUseCount(e.target.checked)} className="h-4 w-4 shrink-0 accent-amber-500" />
              <div className="min-w-0 flex-1">
                <div className="text-[12px] font-semibold text-zinc-200">횟수 제한</div>
                <div className="text-[10px] text-zinc-500">선택 · N회 후 정지</div>
              </div>
            </label>
            <div className="flex shrink-0 items-center gap-1">
              <button type="button" onClick={() => bumpCount(-1)} disabled={!autoUseCount} className="flex h-8 w-7 items-center justify-center rounded-md border border-zinc-700 bg-black/40 text-[15px] leading-none text-zinc-300 active:scale-95 disabled:opacity-40" aria-label="횟수 1 감소">−</button>
              <ZoomSafeInput
                wrapClassName="h-8 w-[56px]"
                value={autoCount}
                onChange={(e) => setAutoCount(e.target.value.replace(/[^0-9]/g, ''))}
                inputMode="numeric"
                disabled={!autoUseCount}
                className="w-full rounded-md border border-zinc-700 bg-black/40 px-2 text-center font-mono text-zinc-100 disabled:opacity-40"
              />
              <button type="button" onClick={() => bumpCount(1)} disabled={!autoUseCount} className="flex h-8 w-7 items-center justify-center rounded-md border border-zinc-700 bg-black/40 text-[15px] leading-none text-zinc-300 active:scale-95 disabled:opacity-40" aria-label="횟수 1 증가">+</button>
            </div>
          </div>
          {/* 하락 시 정지 — 선택 */}
          <label className="flex items-center gap-2 border-t border-zinc-800 py-2.5">
            <input type="checkbox" checked={autoDownStop} onChange={(e) => setAutoDownStop(e.target.checked)} className="h-4 w-4 accent-amber-500" />
            <div className="min-w-0 flex-1">
              <div className="text-[12px] font-semibold text-zinc-200">하락 시 정지</div>
              <div className="text-[10px] text-zinc-500">선택 · 위험구간 안전장치</div>
            </div>
          </label>
          {/* 이탈 시 정지 안내 — 자동 강화는 이 화면에서만 동작(백그라운드 대행 없음). */}
          <p className="mt-2 rounded-lg border border-zinc-800 bg-black/20 px-2.5 py-2 text-[10px] leading-relaxed text-zinc-500">
            화면을 벗어나거나 앱을 종료하면 자동 강화가 멈춥니다. 진행 중엔 화면이 꺼지지 않도록 유지됩니다.
          </p>
          <div className="mt-3 grid grid-cols-[1fr_2fr] gap-2">
            <button type="button" onClick={() => setAutoOpen(false)} className="rounded-xl border border-zinc-700 py-2.5 text-[13px] font-bold text-zinc-400">취소</button>
            <button type="button" onClick={startAuto} className="rounded-xl bg-amber-500 py-2.5 text-[13px] font-extrabold text-black active:scale-[0.98]">자동 시작</button>
          </div>
        </ModalShell>
      ) : null}

      {/* 강화 취소(해제) 확인 모달 — 코너 X → 이 모달 → doCancel(사용자 피드백 1). */}
      {cancelOpen ? (
        <ModalShell
          onClose={() => setCancelOpen(false)}
          label="강화 취소 확인"
          className="w-full max-w-[300px] rounded-2xl border border-zinc-700 bg-zinc-900 p-4"
        >
          <h3 className="text-sm font-bold text-zinc-100">강화를 취소할까요?</h3>
          <p className="mt-2 text-[12px] leading-relaxed text-zinc-400">
            <span className="font-semibold text-zinc-200">{activeJob.name}</span>{' '}
            (+{activeJob.fromLevel})의 강화를 해제합니다.
          </p>
          <p className="mt-1 text-[11px] leading-relaxed text-amber-300/90">
            지금까지 쌓인 강화 시간이 초기화됩니다.
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setCancelOpen(false)} className="rounded-xl border border-zinc-700 py-2.5 text-[13px] font-bold text-zinc-300">돌아가기</button>
            <button type="button" onClick={doCancel} className="rounded-xl bg-red-600 py-2.5 text-[13px] font-extrabold text-white active:scale-[0.98]">강화 취소</button>
          </div>
        </ModalShell>
      ) : null}
    </div>
  );
}
