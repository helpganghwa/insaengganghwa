'use client';

import { useEffect, useState } from 'react';

/**
 * 접속 상태 표시 — last_seen_at(ISO) → 점 + 상대시간(접속 중/N분 전/N시간 전/N일 전).
 * 기록 없으면(null) 영역 비움(null). 클라에서 useEffect로 계산(렌더 순수성 유지) + 1분마다 갱신.
 */
function fmt(iso: string): { online: boolean; label: string } {
  const diff = Date.now() - Date.parse(iso);
  const m = 60_000,
    h = 60 * m,
    d = 24 * h;
  if (diff < 5 * m) return { online: true, label: '접속 중' };
  if (diff < h) return { online: false, label: `${Math.max(1, Math.floor(diff / m))}분 전` };
  if (diff < d) return { online: false, label: `${Math.floor(diff / h)}시간 전` };
  return { online: false, label: `${Math.floor(diff / d)}일 전` };
}

/** fmt 구독 훅 — LastSeen/OnlineDot 공용(1분 갱신, forceOnline 지원). */
function useSeenInfo(at: string | null, forceOnline: boolean) {
  const [info, setInfo] = useState<{ online: boolean; label: string } | null>(
    forceOnline ? { online: true, label: '접속 중' } : null,
  );
  useEffect(() => {
    if (forceOnline) {
      setInfo({ online: true, label: '접속 중' });
      return;
    }
    if (!at) {
      setInfo(null);
      return;
    }
    const tick = () => setInfo(fmt(at));
    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, [at, forceOnline]);
  return info;
}

/** 아바타 모서리용 접속 점 — 위치는 호출부 className(absolute 등)으로 지정. 기록 없으면 미표시. */
export function OnlineDot({
  at,
  forceOnline = false,
  className = '',
}: {
  at: string | null;
  forceOnline?: boolean;
  className?: string;
}) {
  const info = useSeenInfo(at, forceOnline);
  if (!info) return null;
  return (
    <span
      aria-hidden
      className={`inline-block h-1 w-1 rounded-full ${
        info.online ? 'bg-emerald-500' : 'bg-zinc-400 dark:bg-zinc-600'
      } ${className}`}
    />
  );
}

export function LastSeen({
  at,
  forceOnline = false,
  badge = false,
  plain = false,
  className = '',
}: {
  at: string | null;
  /** 본인 행 등 — 저장값과 무관하게 '접속 중'으로 표시(렌더가 하트비트보다 앞서는 지연 회피). */
  forceOnline?: boolean;
  /** 배지 디자인 — 접속중=초록 pill, 비접속=그레이 pill(더 눈에 띄게). */
  badge?: boolean;
  /** 텍스트만(점·pill 없음) — 컴팩트 목록용(길드원 카드 A안). 접속중=초록, 그 외=그레이. */
  plain?: boolean;
  className?: string;
}) {
  const info = useSeenInfo(at, forceOnline);
  if (!info) return null;
  if (plain) {
    return (
      <span
        className={`${info.online ? 'text-emerald-600 dark:text-emerald-400' : 'text-zinc-400 dark:text-zinc-500'} ${className}`}
      >
        {info.label}
      </span>
    );
  }
  if (badge) {
    // 접속중=초록 / 비접속=그레이 pill.
    const tone = info.online
      ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
      : 'bg-zinc-400/15 text-zinc-500 dark:text-zinc-400';
    return (
      <span
        className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none ${tone} ${className}`}
      >
        <span
          className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${info.online ? 'bg-emerald-500' : 'bg-zinc-400 dark:bg-zinc-500'}`}
        />
        {info.label}
      </span>
    );
  }
  return (
    <span className={`inline-flex items-center gap-1 ${className}`}>
      <span
        className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${info.online ? 'bg-emerald-500' : 'bg-zinc-400 dark:bg-zinc-600'}`}
      />
      {info.label}
    </span>
  );
}
