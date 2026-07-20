'use client';

import { useEffect, useRef, useState } from 'react';

/** 연대기 열람 기록 localStorage 키 — 값 = 마지막으로 읽은 공개 연대기의 kst_day. */
export const chronicleReadKey = (serverId: number) => `ig:chron-read:s${serverId}`;

/**
 * 세계지도 카드 문구 — 점령전(매일 KST 23:00) 상태.
 *  - 진행 중(23시대): '점령전 진행중'
 *  - 새 연대기 미열람: '새로운 역사가 쓰였다' 티저(강조색) — 발표 직후 바로 카운트다운으로
 *    돌아가면 밋밋하다는 피드백(2026-07-20). 세계지도 방문 시 열람 처리(ChronicleReadMark).
 *  - 그 외: '다음 점령전까지 N시간 M분' 라이브 카운트다운(1초 갱신).
 * targetMs는 서버가 계산한 다음 23:00의 UTC epoch(ms) — 마운트 후 클라 클럭으로 계산(하이드레이션 안전).
 */
export function ConquestCardStatus({
  inProgress,
  targetMs,
  serverId,
  chronicleDay,
  chronicleHeadline,
}: {
  inProgress: boolean;
  targetMs: number;
  serverId: number;
  chronicleDay: string | null;
  /** 그날 헤드라인(평문) — 있으면 티저 문구로 우선 사용(부모 div의 truncate가 말줄임). */
  chronicleHeadline: string | null;
}) {
  const [now, setNow] = useState<number | null>(null);
  const [unread, setUnread] = useState(false);
  // 긴 헤드라인 마퀴 — 넘친 폭(px). 0이면 정적 표시(짧은 문구·측정 전).
  const [overflowPx, setOverflowPx] = useState(0);
  const wrapRef = useRef<HTMLSpanElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!chronicleDay) return;
    try {
      setUnread(localStorage.getItem(chronicleReadKey(serverId)) !== chronicleDay);
    } catch {
      // localStorage 불가(프라이빗 모드 등) — 카운트다운 폴백
    }
  }, [serverId, chronicleDay]);
  useEffect(() => {
    if (!unread || !wrapRef.current || !textRef.current) return;
    const over = textRef.current.scrollWidth - wrapRef.current.clientWidth;
    setOverflowPx(over > 4 ? over : 0);
  }, [unread, chronicleHeadline]);
  useEffect(() => {
    if (inProgress || unread) return;
    const tick = () => setNow(Date.now());
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [inProgress, unread]);

  if (inProgress) return <>점령전 진행중</>;
  if (unread)
    return (
      // 부모 div의 truncate(말줄임) 대신 좌우 왕복 마퀴(2026-07-21) — 넘칠 때만 애니메이션.
      <span ref={wrapRef} className="block overflow-hidden whitespace-nowrap">
        <span
          ref={textRef}
          className="inline-block font-extrabold text-amber-300 drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]"
          style={
            overflowPx > 0
              ? {
                  ['--mq' as string]: `-${overflowPx}px`,
                  animation: `ig-marquee-x ${Math.max(12, Math.round(overflowPx / 6))}s linear infinite`,
                }
              : undefined
          }
        >
          {chronicleHeadline || '새로운 역사가 쓰였다'}
        </span>
      </span>
    );
  if (now == null) return <>다음 점령전까지</>; // 마운트 전 — 서버 렌더 폴백(하이드레이션 안전)
  const rem = Math.max(0, targetMs - now);
  const h = Math.floor(rem / 3_600_000);
  const m = Math.floor((rem % 3_600_000) / 60_000);
  const s = Math.floor((rem % 60_000) / 1_000);
  const t = h > 0 ? `${h}시간 ${m}분` : m > 0 ? `${m}분 ${s}초` : `${s}초`;
  return <>다음 점령전까지 {t}</>;
}
