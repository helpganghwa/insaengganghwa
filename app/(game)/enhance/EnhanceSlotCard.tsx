'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import {
  effectiveOutcomeProbsBp,
  downRateBp,
  diamondToFinishMs,
  pieceCombatPower,
} from '@/lib/game/balance';
import type { Slot } from '@/lib/db/schema/equipment';
import { BoastModal } from '@/components/BoastModal';
import { TranscendSprite } from '@/components/TranscendSprite';
import { RarityFrame, rarityBorderStyle, hasRarityBorder } from '@/components/RarityFrame';
import { transcendStyle } from '@/lib/game/equipment/transcend';

import { finalizeEnhance, reduceTimeWithGems, cancelEnhanceAction } from './actions';
import { EnhanceFX, type FxKind } from './EnhanceFX';

/** §10 자랑 자동 트리거 강화 단계(GDD §6 / 사용자 확정 델타). */
const BOAST_LEVELS = new Set([30, 50, 99]);

export type ActiveJob = {
  jobId: string;
  code: string;
  name: string;
  slot: Slot;
  fromLevel: number;
  targetLevel: number;
  transcendLevel: number;
  isChampion: boolean;
  baseRateBp: number;
  startedAtIso: string;
  completeAtIso: string;
};

type Outcome = 'success' | 'hold' | 'down';
// 결과·확인 문구 — 대장장이 1인칭/독백 톤, 각 상황 ~20개 랜덤(시도마다 변주).
const OUTCOME_MSGS: Record<Outcome, readonly string[]> = {
  success: [
    '됐다! 결이 살아났어, 한 단계 위로 가는군',
    '쿵! 망치가 제대로 먹혔다… 별이 깃들었구먼',
    '오호— 이 두께, 이 광택. 진화일세',
    '드디어 한 칸 올랐다. 자네 운이 따라줬어',
    '바로 이 맛이지. 강철이 비명을 멈추고 노래한다',
    '내 손이 떨릴 정도구나… 완벽한 한 방이었네',
    '불꽃이 한 호흡 멈췄다. 그게 바로 성공의 신호야',
    '쇠가 내게 고개를 끄덕였다. 진화 성공일세',
    '한 끗, 그 한 끗으로 갈리는 게 강화야. 오늘은 자네 차례군',
    '망치가 노래를 부른다… 한 단계 올랐어',
    '딱! 정확한 자리에 들어갔다. 자네 장비, 한 계단 위로',
    '됐어. 단단해졌어. 가르랑거리는 소리가 들리는군',
    '이 광채를 보게. 진화의 증거일세',
    '운명이 모루 위에 떨어졌다. 자네 편이었어',
    '50년 망치질에 처음 보는 결이군. 진화 성공!',
    '오늘은 자네 좀 봐줘야겠어. 한 칸 더 올랐네',
    '쇠가 묻는다 — 더 강해질래? 그래, 됐다',
    '내 망치는 거짓말 안 한다. 진화일세',
    '강철 깊은 곳에서 무언가가 깨어났어',
    '한 호흡, 한 망치, 한 단계. 오늘은 깔끔하구먼',
  ],
  hold: [
    '어이쿠 손이 미끄러졌네 — 그래도 장비는 멀쩡하다구',
    '아쉽군… 한 끗 모자랐어. 다행히 깨지진 않았네',
    '쇠가 버텨줬다. 다음을 노리세',
    '망치가 비켜갔지만, 자네 장비 의리가 있어',
    '음— 이번엔 운이 따라주지 않는군. 그래도 무사해',
    '단단함이 단계를 지켜냈다. 한 번 더 가지',
    '실패는 면역이 됐어. 단계는 그대로일세',
    '쇠가 한숨을 쉬었다. 깨질 뻔했지만 견뎠어',
    '망치 끝이 미세하게 어긋났구먼. 다음은 잡힐 거야',
    '오늘 망치가 자꾸 가벼워. 한 잔 하고 다시 와',
    '운은 변덕이지. 장비가 멀쩡한 게 어디인가',
    '내 잘못이야, 자네 잘못이 아니야. 다시 해보자',
    '쇠가 굳었어. 다행이지, 단계만 안 떨어졌으면',
    '아슬아슬했어… 한 호흡 더 잡아야겠어',
    '강철은 의리가 있다. 단계는 그대로일세',
    '망치가 빗나갔지만, 자네 장비 마음에 들었나 봐',
    '오, 거의 다 됐었는데. 다음 망치질에 맡기지',
    '잠깐, 다시 보자. 무사하니 다행이야',
    '오늘은 쇠가 까칠하네. 그래도 깨지진 않았어',
    '한 번 빗나가도 자네 장비, 흔들리지 않는군',
  ],
  down: [
    '저런… 무너지는 소리가 들렸네. 한 칸 떨어졌어',
    '쇠가 비명을 질렀다. 단계가 한 줄 깎였구먼',
    '망치가 너무 깊이 들어갔어… 미안하네, 한 단계 하락',
    '균열이 한 줄. 단계가 한 줄. 운명일세',
    '내 망치가 자네 등을 친 꼴이군. 한 칸 내려갔네',
    '쩌적— 이 소리는 못 들은 척하고 싶군',
    '잠깐 한눈팔았더니… 단계가 무너졌어',
    '운명이 비웃네. 강철이 한 칸 깎였다',
    '오늘 쇠가 단단히 화났구먼. 한 단계 하락',
    '미안하네. 망치가 어긋났어. 한 칸 내려갔네',
    '이런… 회복하려면 다시 두드려야겠어',
    '쇠가 토라졌어. 한 단계 떨어졌네',
    '아이고. 너무 무리했나 봐. 한 칸 깎였어',
    '망치 끝이 어긋난 게 보이는군. 단계 하락일세',
    '오늘은 자네 운이 잠시 외출했나 보네… 한 단계 하락',
    '강철이 견디지 못했어. 다음엔 살살 가자',
    '쇠가 깨질 뻔했는데, 단계만 깎이고 멈췄어',
    '내 평생 망치질이 이렇게 무거운 적은 없었네… 하락일세',
    '한 호흡 빗나갔다. 한 단계가 깎였구먼',
    '운명이 자네 뺨을 때렸어. 다시 한 번 가보지',
  ],
} as const;
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
// 강화 시도 중(pending) — 결과 도착 전 잠깐 표시.
const ATTEMPTING_MSGS = [
  '망치가 불을 부른다…',
  '심호흡 한 번… 두드린다',
  '용광로가 으르렁댄다…',
  '쇠가 빨갛게 운다…',
  '운명의 망치가 떨어진다',
  '한 박자, 한 호흡, 한 망치',
  '대장간이 숨을 죽인다…',
  '별이 모루 위에 내려앉는다',
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
  hold: 'text-zinc-200',
  down: 'text-amber-300',
};
const FLASH_CLASS: Record<Outcome, string> = {
  success: 'animate-flash-success',
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
  nickname,
}: {
  activeJob: ActiveJob;
  diamond: string;
  nickname: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [nowMs, setNowMs] = useState(0); // SSR 매칭 위해 0 → mount 후 동기화
  const [confirm, setConfirm] = useState(false);
  const [confirmLeft, setConfirmLeft] = useState(0); // 확인 카운트다운(초). 0=비활성/만료.
  const [flash, setFlash] = useState<Outcome | null>(null);
  const [flashFromLevel, setFlashFromLevel] = useState<number | null>(null); // 결과 직전 레벨(보간 시작)
  const [flashToLevel, setFlashToLevel] = useState<number | null>(null); // 결과 후 새 레벨(보간 종료)
  const [boast, setBoast] = useState(false);
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

  // 3분기 outcome 확률(BALANCE §1.2) — 사이클 내 ℓ 기준. down은 시간 무관 고정.
  const fixedDownBp = downRateBp(activeJob.fromLevel);
  const probs = effectiveOutcomeProbsBp(activeJob.baseRateBp, fixedDownBp, elapsedMs, totalMs);
  const effBp = probs.success;
  const isRiskZone = fixedDownBp > 0;
  const downPct = probs.down / 100;

  const instantCost = remainingMs > 0 ? diamondToFinishMs(remainingMs) : 0;
  const canAfford = BigInt(diamond) >= BigInt(instantCost || 0);

  const doAttempt = () => {
    if (pending) return;
    setConfirm(false);
    setAttempting(true);
    setAttemptingMsg(pick(ATTEMPTING_MSGS));
    startTransition(async () => {
      // 결과 트랜잭션 커밋 즉시 반환(후처리는 서버 after). 이 await만 pending.
      const r = await finalizeEnhance(activeJob.jobId);
      if (r.status === 'error') {
        setAttempting(false);
        alert(r.message);
        return;
      }
      const oc = r.result.outcome as Outcome;
      setAttempting(false);
      setFlash(oc); // 결과 즉시 표시
      // revalidatePath로 activeJob이 즉시 갱신되므로 result 자체의 from/to 보존(보간용).
      setFlashFromLevel(Number(r.result.fromLevel));
      setFlashToLevel(Number(r.result.toLevel));
      setFlashMsg(pick(OUTCOME_MSGS[oc])); // 판타지 톤 5개 중 랜덤
      // 햅틱(모바일) — prefers-reduced-motion 사용자는 햅틱도 약화/생략.
      // Vibration API 없는 브라우저는 navigator.vibrate undefined → 자동 no-op.
      const reduceMotion =
        typeof window !== 'undefined' &&
        window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      if (!reduceMotion && typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        if (oc === 'success' && BOAST_LEVELS.has(activeJob.targetLevel)) {
          navigator.vibrate([0, 50, 80, 50, 80, 100]); // mega
        } else if (oc === 'success') {
          navigator.vibrate(30);
        } else if (oc === 'down') {
          navigator.vibrate([0, 30, 50, 30]);
        }
        // hold: 무음
      }
      // §10 자랑 — +30/+50/+99 강화 성공 시 공유 모달.
      // flash 끝나고 100ms 후 — flash 3s와 비례 유지.
      if (oc === 'success' && BOAST_LEVELS.has(activeJob.targetLevel)) {
        setTimeout(() => setBoast(true), 3100);
      }
      // 새 잡/소진 반영은 축하 연출(3s) 후 비차단 reconcile —
      // setTimeout 콜백은 transition 밖이라 pending을 잡지 않음(결과가 빨리 보임).
      setTimeout(() => {
        setFlash(null);
        setFlashMsg(null);
        setFlashFromLevel(null);
        setFlashToLevel(null);
        router.refresh();
      }, 3000);
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
    startTransition(async () => {
      const r = await reduceTimeWithGems(activeJob.jobId, instantCost);
      if (r.status === 'error') {
        setOptimisticDone(false);
        alert(r.message);
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
        alert(r.message);
      } else {
        router.refresh();
      }
    });
  };

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
        tabIndex={pending ? -1 : 0}
        aria-label={`강화 시도 — 현재 성공률 ${(effBp / 100).toFixed(1)}%`}
        onClick={() => {
          if (pending || flash) return;
          // 확인 모드: 두 번째 탭 = 강화. 그 외(기본): 첫 탭 = 확인 진입.
          if (confirm) doAttempt();
          else setConfirm(true);
        }}
        onKeyDown={(e) => {
          if ((e.key === 'Enter' || e.key === ' ') && !pending && !flash) {
            e.preventDefault();
            if (confirm) doAttempt();
            else setConfirm(true);
          }
        }}
        className={`relative h-[92px] cursor-pointer overflow-hidden rounded-xl border-2 bg-zinc-950 text-zinc-100 transition active:scale-[0.99] ${
          ready ? 'border-emerald-500' : 'border-zinc-700'
        } ${flash ? FLASH_CLASS[flash] : ''} ${pending ? 'opacity-70' : ''}`}
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
            className={`relative flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-black/40 ${
              hasRarityBorder(activeJob.transcendLevel) ? '' : 'border-zinc-700'
            }`}
            style={rarityBorderStyle(activeJob.transcendLevel)}
          >
            <RarityFrame level={activeJob.transcendLevel} />
            <TranscendSprite
              code={activeJob.code}
              slot={activeJob.slot}
              level={activeJob.transcendLevel}
              isChampion={activeJob.isChampion}
              size={60}
              frameless
            />
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-0.5 overflow-hidden">
            {/* 1줄: 이름 — 자연 wrap(잘림 없음). 한국어는 break-keep로 단어 경계 줄바꿈.
                초월 ≥ T1이면 이름 끝에 inline T라벨(등급 색상)로 따라붙음 — wrap 시 마지막 줄 끝. */}
            <div className="text-sm font-bold leading-tight break-keep">
              {activeJob.name}
              {activeJob.transcendLevel > 0 ? (
                <span
                  className="ml-1.5 align-middle text-[10px] font-bold tabular-nums"
                  style={{
                    color: `rgb(${transcendStyle(activeJob.transcendLevel).colorRgb.join(',')})`,
                  }}
                >
                  T{activeJob.transcendLevel}
                </span>
              ) : null}
            </div>
            {/* 2줄: 확률 — 짧으니 잘릴 일 없음. */}
            <div className="flex gap-2 text-[11px] font-semibold tabular-nums whitespace-nowrap">
              <span className="text-emerald-300">성공 {(effBp / 100).toFixed(1)}%</span>
              <span className="text-zinc-500">최대 {(activeJob.baseRateBp / 100).toFixed(0)}%</span>
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
              disabled={pending || !instantCost || !canAfford}
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
              disabled={pending}
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
          <div className="pointer-events-none absolute inset-0 z-20 flex flex-col items-center justify-center gap-1 px-4 text-center">
            <p className="relative z-30 text-[12px] font-semibold break-keep text-amber-200 drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
              {confirmMsg ??
                (ready ? '다시 탭하면 강화' : '아직 무르익지 않았다 — 다시 탭하면 강행')}
            </p>
            <p className="relative z-30 font-mono text-[10px] text-zinc-300 tabular-nums drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
              {confirmLeft}s 후 자동 취소
            </p>
          </div>
        ) : null}

        {attempting && !flash ? (
          <div className="pointer-events-none absolute inset-0 z-20 flex flex-col items-center justify-center gap-1 px-4 text-center">
            <p className="relative z-30 text-[12px] font-semibold break-keep text-amber-200 drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
              {attemptingMsg ?? '망치가 불을 부른다…'}
            </p>
          </div>
        ) : null}

        {flash ? (
          <>
            {/* FX 시각 레이어 — Boast 레벨 성공은 mega tier. */}
            <EnhanceFX
              kind={
                flash === 'success' && BOAST_LEVELS.has(activeJob.targetLevel)
                  ? ('success-mega' satisfies FxKind)
                  : (flash satisfies FxKind)
              }
              fromLevel={flashFromLevel ?? activeJob.fromLevel}
              toLevel={flashToLevel ?? activeJob.fromLevel}
            />
            {/* 판타지 톤 메시지 — 최상위(z-30), 모든 FX 위. */}
            <span className="pointer-events-none absolute inset-x-0 bottom-2 z-30 flex items-center justify-center px-5 text-center">
              <span
                className={`rounded bg-black/75 px-2 py-0.5 text-[11px] font-medium break-keep ${OUTCOME_TONE[flash]}`}
              >
                {flashMsg ?? OUTCOME_MSGS[flash][0]}
              </span>
            </span>
          </>
        ) : null}
      </div>

      <BoastModal
        open={boast}
        onClose={() => setBoast(false)}
        nickname={nickname}
        kind="piece"
        headline={`✨ +${activeJob.targetLevel} 강화 달성`}
        piece={{
          p: {
            slot: activeJob.slot,
            code: activeJob.code,
            name: activeJob.name,
            enhanceLevel: activeJob.targetLevel,
            transcendLevel: activeJob.transcendLevel,
            isChampion: activeJob.isChampion,
          },
          cp: pieceCombatPower(activeJob.targetLevel, activeJob.transcendLevel),
        }}
      />
    </div>
  );
}
