'use client';

import { useEffect, useState, type ReactNode } from 'react';

/**
 * 1초 시계 격리 컴포넌트(2026-08-06) — 카운트다운·경과시간 "표시 지점"에만 배치해,
 * 부모(세계지도·배치보드·레이드 카드 등 무거운 트리)가 매초 통째로 리렌더되는 것을 막는다.
 * 채팅 ChatRow memo 분리와 같은 원리: 초 단위 상태는 그 글자를 그리는 최하위에만 둔다.
 *
 * SSR/하이드레이션 안전 — 서버 렌더와 첫 클라 페인트는 null(기존 nowMs=null 패턴과 동일),
 * effect에서 즉시 1회 세팅 후 매초 갱신. 시계 텍스트가 한 프레임 늦게 뜨는 것은 수용.
 */
export function Ticker({
  intervalMs = 1000,
  children,
}: {
  intervalMs?: number;
  children: (now: number) => ReactNode;
}) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  if (now === null) return null;
  return <>{children(now)}</>;
}
