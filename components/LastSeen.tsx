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

export function LastSeen({ at, className = '' }: { at: string | null; className?: string }) {
  const [info, setInfo] = useState<{ online: boolean; label: string } | null>(null);
  useEffect(() => {
    if (!at) {
      setInfo(null);
      return;
    }
    const tick = () => setInfo(fmt(at));
    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, [at]);
  if (!info) return null;
  return (
    <span className={`inline-flex items-center gap-1 ${className}`}>
      <span
        className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${info.online ? 'bg-emerald-500' : 'bg-zinc-400 dark:bg-zinc-600'}`}
      />
      {info.label}
    </span>
  );
}
