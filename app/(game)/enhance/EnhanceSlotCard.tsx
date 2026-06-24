'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import {
  effectiveOutcomeProbsBp,
  downRateBp,
  diamondToFinishMs,
} from '@/lib/game/balance';
import type { Slot } from '@/lib/db/schema/equipment';
import { TranscendSprite } from '@/components/TranscendSprite';
import { RarityFrame, rarityBorderStyle, hasRarityBorder } from '@/components/RarityFrame';
import { transcendStyle } from '@/lib/game/equipment/transcend';

import { useResourceToast } from '@/components/ResourceToast';

import { finalizeEnhance, reduceTimeWithGems, cancelEnhanceAction } from './actions';
import { completeTutorial } from '@/components/tutorial/events';
import { useDiamond } from '@/components/DiamondContext';
import { sounds } from '@/lib/game/sound';

import { EnhanceFX, type FxKind } from './EnhanceFX';

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

function fmtRemaining(ms: number): string {
  if (ms <= 0) return '완료';
  const s = Math.ceil(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0 ? `${h}시간 ${m}분` : m > 0 ? `${m}분 ${sec}초` : `${sec}초`;
}

export function EnhanceSlotCard({
  activeJob,
  diamond,
}: {
  activeJob: ActiveJob;
  diamond: string;
}) {
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
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [confirmCancelLeft, setConfirmCancelLeft] = useState(0);
  const [confirmReduce, setConfirmReduce] = useState(false);
  const [confirmReduceLeft, setConfirmReduceLeft] = useState(0);
  const [flashMsg, setFlashMsg] = useState<string | null>(null); // outcome 랜덤 메시지
  const [confirmMsg, setConfirmMsg] = useState<string | null>(null); // 확인 랜덤 메시지
  const [attempting, setAttempting] = useState(false); // 강화 시도 중(취소/단축 제외)
  const [attemptingMsg, setAttemptingMsg] = useState<string | null>(null);

  useEffect(() => {
    setNowMs(Date.now());
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    setOptimisticDone(false);
    setConfirm(false);
  }, [activeJob.jobId]);
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
  // 취소·다이아 단축 — 동일 3s 재탭 패턴(카운트 라벨 노출용 useEffect).
  useEffect(() => {
    if (!confirmCancel) {
      setConfirmCancelLeft(0);
      return;
    }
    setConfirmCancelLeft(3);
    const id = setInterval(() => {
      setConfirmCancelLeft((s) => {
        if (s <= 1) {
          setConfirmCancel(false);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [confirmCancel]);
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
      const r = await finalizeEnhance(activeJob.jobId);
      if (r.status === 'error') {
        setAttempting(false);
        showError(r.message);
        return;
      }
      // 튜토리얼: 첫 강화 시도 완료 신호(코치가 attempt 단계일 때만 마무리 팝업).
      completeTutorial();
      // 강화 결과 토스트 — 누적(last-wins)만 하고, 결과 오버레이 종료 시 노출.
      // 이 슬롯 오버레이 시작 신호(begin) → 종료 setTimeout에서 end → 모든 슬롯 0이면 토스트.
      showRanking(r.ranksBefore, r.ranksAfter);
      beginEnhanceOverlay();
      const oc = r.result.outcome as Outcome;
      const fromLv = Number(r.result.fromLevel);
      const toLv = Number(r.result.toLevel);
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
          router.refresh();
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
          router.refresh();
        }, 2500);
      }
    });
  };

  const doReduce = () => {
    if (pending || !instantCost || !canAfford) return;
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
      const r = await reduceTimeWithGems(activeJob.jobId, instantCost);
      if (r.status === 'error') {
        setOptimisticDone(false);
        adjustDiamond(debit); // 롤백
        showError(r.message);
      } else router.refresh();
    });
  };

  const [optimisticCancelled, setOptimisticCancelled] = useState(false);
  const doCancel = () => {
    if (attempting) return;
    if (!confirmCancel) {
      setConfirmCancel(true);
      return;
    }
    setConfirmCancel(false);
    setOptimisticCancelled(true); // 카드 즉시 숨김 — 처리중 표시 X
    void cancelEnhanceAction(activeJob.jobId).then((r) => {
      if (r.status === 'error') {
        setOptimisticCancelled(false);
        showError(r.message);
      } else {
        router.refresh();
      }
    });
  };

  // 보석 단축/취소 3초 컨펌 중에는 슬롯의 다른 영역(강화 시도·반대 버튼) 클릭 불가 — 오탭/혼선 방지.
  const otherActionConfirm = confirmReduce || confirmCancel;

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
          if (pending || flash || otherActionConfirm) return; // 보석단축/취소 컨펌 중엔 시도 영역 잠금
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
                confirmCancel || // 취소 컨펌 중엔 단축 잠금
                attempting ||
                !!flash
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
            <button
              type="button"
              disabled={pending || confirm || confirmReduce || attempting || !!flash}
              onClick={(e) => {
                e.stopPropagation();
                doCancel();
              }}
              className={`h-6 w-[54px] rounded-md border text-[9px] font-bold tabular-nums disabled:opacity-40 ${
                confirmCancel
                  ? 'animate-pulse border-red-400 bg-red-500 text-white'
                  : 'border-zinc-600 bg-zinc-800/60 text-zinc-200'
              }`}
            >
              {confirmCancel ? `확인 ${confirmCancelLeft}s` : '취소'}
            </button>
          </div>
        </div>

        {confirm && !attempting && !flash ? (
          <div className="pointer-events-none absolute inset-0 z-20 flex flex-col items-center justify-center gap-1 bg-black/55 px-4 text-center backdrop-blur-[2px]">
            <span className="relative z-30 rounded bg-black/75 px-2 py-0.5 text-[12px] font-semibold break-keep text-amber-200">
              {confirmMsg ??
                (ready ? '다시 탭하면 강화' : '아직 무르익지 않았다 — 다시 탭하면 강행')}
            </span>
            <span className="relative z-30 rounded bg-black/75 px-2 py-0.5 font-mono text-[10px] text-zinc-300 tabular-nums">
              {confirmLeft}s 후 자동 취소
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
      </div>

    </div>
  );
}
