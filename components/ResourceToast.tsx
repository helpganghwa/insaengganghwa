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

type ToastEntry = ResourceToast | ErrorToast | RankingToast;

type ToastContextValue = {
  showResource: (icon: string, label: string, delta?: number) => void;
  showError: (message: string) => void;
  /** 강화 랭킹 변동 — last-wins 디바운스 3s 후 한 번만 노출. */
  showRanking: (before: MyRanks, after: MyRanks) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function useResourceToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) return { showResource: () => {}, showError: () => {}, showRanking: () => {} };
  return ctx;
}

const RANKING_DEBOUNCE_MS = 1200;
const RANKING_TOAST_MS = 3200;

export function ResourceToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastEntry[]>([]);
  const counterRef = useRef(0);
  /** 디바운스 큐 — 첫 before 보존, 마지막 after 갱신(last-wins). */
  const rankingPendingRef = useRef<{ before: MyRanks; after: MyRanks } | null>(null);
  const rankingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const showRanking = useCallback(
    (before: MyRanks, after: MyRanks) => {
      if (rankingPendingRef.current) {
        rankingPendingRef.current.after = after; // 첫 before 보존, 마지막 after로 누적.
      } else {
        rankingPendingRef.current = { before, after };
      }
      if (rankingTimerRef.current) clearTimeout(rankingTimerRef.current);
      rankingTimerRef.current = setTimeout(() => {
        const data = rankingPendingRef.current;
        rankingPendingRef.current = null;
        rankingTimerRef.current = null;
        if (!data) return;
        const id = ++counterRef.current;
        setToasts((prev) => [
          ...prev,
          { id, kind: 'ranking', before: data.before, after: data.after },
        ]);
        setTimeout(() => dismiss(id), RANKING_TOAST_MS);
      }, RANKING_DEBOUNCE_MS);
    },
    [dismiss],
  );

  // 랭킹 토스트(헤더 슬라이드)와 기타 토스트(중앙 상단) 위치 분리.
  const rankingToasts = toasts.filter((t): t is RankingToast => t.kind === 'ranking');
  const otherToasts = toasts.filter((t) => t.kind !== 'ranking');

  return (
    <ToastContext.Provider value={{ showResource, showError, showRanking }}>
      {children}
      {/* 헤더(h-12=48px) 위 슬라이드 바 — sticky 헤더(z-30)를 덮도록 z-40. */}
      <div className="pointer-events-none fixed inset-x-0 top-0 z-40 overflow-hidden">
        {rankingToasts.map((t) => (
          <RankingBar key={t.id} entry={t} />
        ))}
      </div>
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

/** 카운트업 — easeOutCubic, 변동 클수록 길게(700~1500ms). */
function CountUp({ from, to }: { from: number; to: number }) {
  const [v, setV] = useState(from);
  useEffect(() => {
    if (from === to) {
      setV(to);
      return;
    }
    const diff = Math.abs(to - from);
    // 작은 변동(<5)은 0.7s, 큰 변동은 1.5s. 로그 스케일로 부드럽게.
    const duration = Math.min(1500, 700 + Math.log10(1 + diff) * 400);
    const t0 = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const t = Math.min(1, (now - t0) / duration);
      const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
      setV(Math.round(from + (to - from) * eased));
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [from, to]);
  return <>{v.toLocaleString('ko-KR')}</>;
}

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
  const rankDelta = before.rank - after.rank;
  const arrow = rankDelta > 0 ? `▲${rankDelta}` : rankDelta < 0 ? `▼${-rankDelta}` : '—';
  const arrowColor =
    rankDelta > 0 ? 'text-amber-300' : rankDelta < 0 ? 'text-zinc-500' : 'text-zinc-600';
  return (
    <div className="flex min-w-0 flex-1 flex-col items-center justify-center px-1 leading-tight tabular-nums">
      <span className="text-[9px] text-zinc-400">{label}</span>
      <div className="flex items-baseline gap-1 text-[11px]">
        <span className="font-bold text-white">
          <CountUp from={before.value} to={after.value} />
        </span>
        <span className="text-zinc-300">
          #<CountUp from={before.rank} to={after.rank} />
        </span>
        <span className={`text-[9px] font-bold ${arrowColor}`}>{arrow}</span>
      </div>
    </div>
  );
}

/** 헤더 위 슬라이드 바 — 헤더(h-12)와 같은 크기로 덮음, 진입/종료 슬라이드. */
function RankingBar({ entry }: { entry: RankingToast }) {
  return (
    <div
      className="pointer-events-none w-full border-b border-amber-700/40 bg-zinc-950/95 shadow-lg backdrop-blur"
      style={{
        animation: `ranking-bar ${RANKING_TOAST_MS}ms ease-out forwards`,
        paddingTop: 'env(safe-area-inset-top)',
      }}
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
