'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

import type { MyRanks } from '@/lib/game/leaderboard/queries';

type ResourceToast = {
  id: number;
  kind: 'resource';
  icon: string;
  label: string;
  /** 미지정 = 수치 표기 없이 label만(성공 스타일). */
  delta?: number;
};

type ErrorToast = {
  id: number;
  kind: 'error';
  message: string;
};

type RankingToast = {
  id: number;
  kind: 'ranking';
  before: MyRanks;
  after: MyRanks;
};

/** 공용 헤더 토스트 — 헤더(h-12)를 덮는 슬라이드 바. 제목 + 보상 한 줄 중앙 정렬. */
export type HeaderReward = { icon: string; amount: number };
type HeaderToast = {
  id: number;
  kind: 'header';
  icon?: string;
  title: string;
  rewards?: HeaderReward[];
};

type ToastEntry = ResourceToast | ErrorToast | RankingToast | HeaderToast;

type ToastContextValue = {
  showResource: (icon: string, label: string, delta?: number) => void;
  showError: (message: string) => void;
  /**
   * 랭킹 변동 토스트. 기본(강화): 누적(last-wins) 후 모든 강화 오버레이 종료 시 한 번 노출.
   * immediate=true(인벤토리 분해/초월/장비상세): 동기화할 결과 오버레이가 없어 즉시 노출(디바운스 없음).
   */
  showRanking: (before: MyRanks, after: MyRanks, immediate?: boolean) => void;
  /** 강화 결과 오버레이 시작/종료 신호 — 활성 0 도달 시 누적 랭킹 토스트 release. */
  beginEnhanceOverlay: () => void;
  endEnhanceOverlay: () => void;
  /** 공용 헤더 토스트 — 헤더 덮는 슬라이드 바. 제목 + 보상 한 줄(좌우 구분 없이 중앙). */
  showHeaderToast: (opts: { icon?: string; title: string; rewards?: HeaderReward[] }) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function useResourceToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx)
    return {
      showResource: () => {},
      showError: () => {},
      showRanking: () => {},
      beginEnhanceOverlay: () => {},
      endEnhanceOverlay: () => {},
      showHeaderToast: () => {},
    };
  return ctx;
}

// 강화 결과 토스트는 '오버레이 종료' 신호로 release(고정 디바운스 X). 아래는 신호
// 유실(슬롯 언마운트 등) 대비 강제 release 안전망 시간.
const RANKING_FALLBACK_MS = 6000;
const RANKING_TOAST_MS = 4400;

// 공용 헤더 토스트 — 보상 인지용(자원 2.4s와 우승 3.8s 사이). 슬라이드 in/out 0.45s.
const HEADER_TOAST_VISIBLE_MS = 2600;
const HEADER_TOAST_EXIT_MS = 450;

export function ResourceToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastEntry[]>([]);
  const counterRef = useRef(0);
  /** 누적 큐 — 첫 before 보존, 마지막 after 갱신(last-wins). 모든 오버레이 종료 시 release. */
  const rankingPendingRef = useRef<{ before: MyRanks; after: MyRanks } | null>(null);
  /** 활성 강화 결과 오버레이 수 — 0 도달 시 누적 랭킹 토스트 노출. */
  const overlayCountRef = useRef(0);
  /** 오버레이 종료 신호 유실 대비 강제 release 타이머. */
  const rankingFallbackRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showResource = useCallback(
    (icon: string, label: string, delta?: number) => {
      const id = ++counterRef.current;
      setToasts((prev) => [...prev, { id, kind: 'resource', icon, label, delta }]);
      setTimeout(() => dismiss(id), 2400);
    },
    [dismiss],
  );

  const showError = useCallback(
    (message: string) => {
      const id = ++counterRef.current;
      setToasts((prev) => [...prev, { id, kind: 'error', message }]);
      setTimeout(() => dismiss(id), 4000);
    },
    [dismiss],
  );

  // 공용 헤더 토스트 — 진입/이탈 슬라이드는 HeaderBar가 자체 타이머로 구동(이탈 애니메이션
  // 위해 provider는 dismiss만 위임). 노출 후 HeaderBar가 onDone으로 self-unmount.
  const showHeaderToast = useCallback(
    (opts: { icon?: string; title: string; rewards?: HeaderReward[] }) => {
      const id = ++counterRef.current;
      setToasts((prev) => [
        ...prev,
        { id, kind: 'header', icon: opts.icon, title: opts.title, rewards: opts.rewards },
      ]);
    },
    [],
  );

  // 누적 랭킹 토스트 노출(덮어쓰기 — 최신만). 모든 오버레이 종료 or 안전망에서 호출.
  const releaseRanking = useCallback(() => {
    if (rankingFallbackRef.current) {
      clearTimeout(rankingFallbackRef.current);
      rankingFallbackRef.current = null;
    }
    const data = rankingPendingRef.current;
    rankingPendingRef.current = null;
    if (!data) return;
    const id = ++counterRef.current;
    setToasts((prev) => [
      ...prev.filter((t) => t.kind !== 'ranking'),
      { id, kind: 'ranking', before: data.before, after: data.after },
    ]);
    setTimeout(() => dismiss(id), RANKING_TOAST_MS);
  }, [dismiss]);

  const showRanking = useCallback(
    (before: MyRanks, after: MyRanks, immediate = false) => {
      if (rankingPendingRef.current) {
        rankingPendingRef.current.after = after; // 첫 before 보존, 마지막 after로 누적.
      } else {
        rankingPendingRef.current = { before, after };
      }
      // 인벤토리(분해/초월/장비상세) — 동기화할 강화 결과 오버레이가 없으므로 누적·안전망
      // 디바운스 없이 즉시 노출. (releaseRanking이 잔여 fallback 타이머도 정리)
      if (immediate) {
        releaseRanking();
        return;
      }
      // 강화 플로우 — 노출은 오버레이 종료(end → count 0)에서. 신호 유실 대비 안전망만 재무장.
      if (rankingFallbackRef.current) clearTimeout(rankingFallbackRef.current);
      rankingFallbackRef.current = setTimeout(() => {
        overlayCountRef.current = 0;
        releaseRanking();
      }, RANKING_FALLBACK_MS);
    },
    [releaseRanking],
  );

  // 강화 결과 오버레이 시작/종료 — 활성 0 도달 시 누적 랭킹 토스트 release(슬롯 간 공유).
  const beginEnhanceOverlay = useCallback(() => {
    overlayCountRef.current += 1;
  }, []);
  const endEnhanceOverlay = useCallback(() => {
    overlayCountRef.current = Math.max(0, overlayCountRef.current - 1);
    if (overlayCountRef.current === 0) releaseRanking();
  }, [releaseRanking]);

  // 헤더 슬라이드 바(랭킹/공용 헤더)와 중앙 상단 토스트(자원/에러) 위치 분리.
  const rankingToasts = toasts.filter((t): t is RankingToast => t.kind === 'ranking');
  const headerToasts = toasts.filter((t): t is HeaderToast => t.kind === 'header');
  const otherToasts = toasts.filter((t) => t.kind === 'resource' || t.kind === 'error');

  return (
    <ToastContext.Provider
      value={{
        showResource,
        showError,
        showRanking,
        beginEnhanceOverlay,
        endEnhanceOverlay,
        showHeaderToast,
      }}
    >
      {children}
      {/* 헤더(h-12=48px) 위 슬라이드 바 — sticky 헤더(z-30)를 덮도록 z-40. */}
      <div className="pointer-events-none fixed inset-x-0 top-0 z-40 overflow-hidden">
        {rankingToasts.map((t) => (
          <RankingBar key={t.id} entry={t} />
        ))}
      </div>
      {/* 공용 헤더 토스트 — 헤더 덮는 슬라이드 바(WINNER 토스트와 동일 패턴). 각 바가 자체 fixed. */}
      {headerToasts.map((t) => (
        <HeaderBar key={t.id} entry={t} onDismiss={dismiss} />
      ))}
      {/* 자원/에러 토스트 — 중앙 상단(기존 위치). */}
      <div
        className="pointer-events-none fixed left-1/2 z-[75] flex -translate-x-1/2 flex-col items-center gap-2"
        style={{ top: 'calc(env(safe-area-inset-top) + 4rem)' }}
        aria-live="polite"
      >
        {otherToasts.map((t) =>
          t.kind === 'resource' ? (
            <ResourceItem key={t.id} entry={t} />
          ) : (
            <ErrorItem key={t.id} entry={t} onDismiss={() => dismiss(t.id)} />
          ),
        )}
      </div>
    </ToastContext.Provider>
  );
}

/** 카운트업 — easeOutCubic, 변동 크기로 600~1000ms. delay(ms) 동안 from에 머무름. */
function CountUp({ from, to, delay = 0 }: { from: number; to: number; delay?: number }) {
  const [v, setV] = useState(from);
  useEffect(() => {
    if (from === to) {
      setV(to);
      return;
    }
    const diff = Math.abs(to - from);
    const duration = Math.min(1400, 800 + Math.log10(1 + diff) * 300);
    const startAt = performance.now() + delay;
    let raf = 0;
    const step = (now: number) => {
      if (now < startAt) {
        raf = requestAnimationFrame(step);
        return;
      }
      const t = Math.min(1, (now - startAt) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setV(Math.round(from + (to - from) * eased));
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [from, to, delay]);
  return <>{v.toLocaleString('ko-KR')}</>;
}

const RANK_REVEAL_MS = 2200;

function RankingCompact({
  label,
  before,
  after,
}: {
  label: string;
  before: { value: number; rank: number } | null;
  after: { value: number; rank: number } | null;
}) {
  if (!before || !after) {
    return (
      <div className="flex min-w-0 flex-1 flex-col items-center justify-center px-1 leading-tight">
        <span className="text-[9px] text-zinc-500">{label}</span>
        <span className="text-[10px] text-zinc-600">—</span>
      </div>
    );
  }
  const valueDelta = after.value - before.value;
  const valueArrow = valueDelta > 0 ? `▲${valueDelta}` : valueDelta < 0 ? `▼${-valueDelta}` : '—';
  const valueArrowColor =
    valueDelta > 0 ? 'text-emerald-400' : valueDelta < 0 ? 'text-red-400' : 'text-zinc-500';
  const rankDelta = before.rank - after.rank; // rank 낮을수록 상위 → 양수 = 상승
  const rankArrow = rankDelta > 0 ? `▲${rankDelta}` : rankDelta < 0 ? `▼${-rankDelta}` : '—';
  const rankArrowColor =
    rankDelta > 0 ? 'text-emerald-400' : rankDelta < 0 ? 'text-red-400' : 'text-zinc-500';
  // Phase 1 (값) → Phase 2 (순위) 같은 자리에 교차. animation duration은 토스트 노출 시간과 일치.
  const phaseValueStyle = {
    animation: `ranking-value ${RANKING_TOAST_MS}ms ease-out forwards`,
  } as const;
  const phaseRankStyle = {
    animation: `ranking-rank ${RANKING_TOAST_MS}ms ease-out forwards`,
  } as const;
  return (
    <div className="flex min-w-0 flex-1 flex-col items-center justify-center px-1 leading-tight tabular-nums">
      <span className="text-[9px] text-zinc-400">{label}</span>
      <div className="relative flex h-4 w-full items-center justify-center text-[11px]">
        <span
          className="absolute inset-0 flex items-baseline justify-center gap-1"
          style={phaseValueStyle}
        >
          <span className="font-bold text-white">
            <CountUp from={before.value} to={after.value} />
          </span>
          <span className={`text-[9px] font-bold ${valueArrowColor}`}>{valueArrow}</span>
        </span>
        <span
          className="absolute inset-0 flex items-baseline justify-center gap-1"
          style={phaseRankStyle}
        >
          <span className="text-zinc-300">
            #<CountUp from={before.rank} to={after.rank} delay={RANK_REVEAL_MS} />
          </span>
          <span className={`text-[9px] font-bold ${rankArrowColor}`}>{rankArrow}</span>
        </span>
      </div>
    </div>
  );
}

/** 헤더 위 바 — 헤더(h-12)와 같은 크기로 덮음. 즉시 표시 → RANKING_TOAST_MS 후 즉시 unmount. */
function RankingBar({ entry }: { entry: RankingToast }) {
  return (
    <div
      className="pointer-events-none w-full border-b border-zinc-200 bg-zinc-950/95 shadow-lg backdrop-blur dark:border-zinc-800"
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      <div className="flex h-12 items-center justify-between gap-1 px-3">
        <RankingCompact label="최고" before={entry.before.max} after={entry.after.max} />
        <span aria-hidden className="text-zinc-700">·</span>
        <RankingCompact label="합산" before={entry.before.sum} after={entry.after.sum} />
        <span aria-hidden className="text-zinc-700">·</span>
        <RankingCompact label="전투력" before={entry.before.combat} after={entry.after.combat} />
      </div>
    </div>
  );
}

/**
 * 공용 헤더 토스트 바 — WINNER 토스트와 동일하게 헤더(safe-area + h-12)를 덮고 슬라이드.
 * 진입 winner-drop → HEADER_TOAST_VISIBLE_MS 표시 → winner-up 이탈 후 onDone(self-unmount).
 * 내용은 좌우 구분 없이 중앙 정렬: [아이콘] 제목 │ 보상…
 */
function HeaderBar({ entry, onDismiss }: { entry: HeaderToast; onDismiss: (id: number) => void }) {
  const [exit, setExit] = useState(false);
  const { id } = entry; // onDismiss(dismiss)·id 모두 안정 → 마운트 시 1회 타이머.
  useEffect(() => {
    const t1 = setTimeout(() => setExit(true), HEADER_TOAST_VISIBLE_MS);
    const t2 = setTimeout(() => onDismiss(id), HEADER_TOAST_VISIBLE_MS + HEADER_TOAST_EXIT_MS);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [id, onDismiss]);
  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-0 z-[60]"
      role="status"
      aria-live="polite"
      style={{
        animation: exit
          ? `winner-up ${HEADER_TOAST_EXIT_MS}ms cubic-bezier(0.22,1,0.36,1) forwards`
          : `winner-drop ${HEADER_TOAST_EXIT_MS}ms cubic-bezier(0.22,1,0.36,1) both`,
      }}
    >
      {/* 헤더 정확히 덮기 — 셸 폭(max-w-390) + safe-area pad + h-12 (AppHeader와 동일 구조). */}
      <div
        className="mx-auto max-w-[390px] border-b border-zinc-700/60 bg-zinc-950/95 shadow-[0_4px_16px_rgba(0,0,0,0.5)] backdrop-blur-sm"
        style={{ paddingTop: 'env(safe-area-inset-top)' }}
      >
        <div className="flex h-12 items-center justify-center gap-2 px-3">
          {entry.icon ? (
            <span aria-hidden className="text-base leading-none">
              {entry.icon}
            </span>
          ) : null}
          <span className="text-[13px] font-bold text-white">{entry.title}</span>
          {entry.rewards && entry.rewards.length > 0 ? (
            <>
              <span aria-hidden className="h-3.5 w-px bg-zinc-600" />
              <span className="flex items-center gap-2 font-mono text-[12px] tabular-nums text-zinc-200">
                {entry.rewards.map((r, i) => (
                  <span key={i} className="inline-flex items-center gap-0.5">
                    <span aria-hidden>{r.icon}</span>+{r.amount.toLocaleString('ko-KR')}
                  </span>
                ))}
              </span>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function ResourceItem({ entry }: { entry: ResourceToast }) {
  const positive = entry.delta === undefined || entry.delta > 0;
  return (
    <div
      className={`pointer-events-none flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-medium shadow-lg ${
        positive
          ? 'bg-emerald-500 text-white dark:bg-emerald-600/90'
          : 'bg-zinc-900 text-zinc-100 dark:bg-zinc-100 dark:text-zinc-900'
      }`}
      style={{ animation: 'toast-pop 0.3s ease-out, toast-fall 1.6s ease-in 0.6s forwards' }}
    >
      <span aria-hidden>{entry.icon}</span>
      <span>
        {entry.delta !== undefined && entry.delta !== 0
          ? `${entry.delta > 0 ? '+' : ''}${entry.delta} `
          : ''}
        {entry.label}
      </span>
    </div>
  );
}

function ErrorItem({ entry, onDismiss }: { entry: ErrorToast; onDismiss: () => void }) {
  return (
    <div
      className="pointer-events-auto flex max-w-xs items-center gap-2 rounded-xl bg-red-600 px-4 py-2 text-sm font-medium text-white shadow-lg dark:bg-red-700/90"
      role="alert"
      style={{ animation: 'toast-pop 0.3s ease-out' }}
    >
      <span aria-hidden>⚠️</span>
      <span className="flex-1">{entry.message}</span>
      <button
        type="button"
        onClick={onDismiss}
        className="rounded-full px-1 text-white/80 hover:text-white"
        aria-label="닫기"
      >
        ✕
      </button>
    </div>
  );
}
