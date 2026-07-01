'use client';

import { useEffect, useState } from 'react';

/**
 * 세계지도 카드 문구 — 점령전(매일 KST 23:00) 상태.
 *  - 진행 중(23시대): '점령전 진행중'
 *  - 그 외: '다음 점령전까지 N시간 M분' 라이브 카운트다운(1초 갱신).
 * targetMs는 서버가 계산한 다음 23:00의 UTC epoch(ms) — 마운트 후 클라 클럭으로 계산(하이드레이션 안전).
 */
export function ConquestCardStatus({ inProgress, targetMs }: { inProgress: boolean; targetMs: number }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    if (inProgress) return;
    const tick = () => setNow(Date.now());
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [inProgress]);

  if (inProgress) return <>점령전 진행중</>;
  if (now == null) return <>다음 점령전까지</>; // 마운트 전 — 서버 렌더 폴백(하이드레이션 안전)
  const rem = Math.max(0, targetMs - now);
  const h = Math.floor(rem / 3_600_000);
  const m = Math.floor((rem % 3_600_000) / 60_000);
  const s = Math.floor((rem % 60_000) / 1_000);
  const t = h > 0 ? `${h}시간 ${m}분` : m > 0 ? `${m}분 ${s}초` : `${s}초`;
  return <>다음 점령전까지 {t}</>;
}
