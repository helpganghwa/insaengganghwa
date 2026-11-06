'use client';

import { useSyncExternalStore } from 'react';

/**
 * 분 단위 현재 시각(ms, 분 경계로 내림)(2026-11-06 업데이트 18).
 *
 * 렌더 본문에서 `Date.now()`를 부르면 React Compiler가 그 컴포넌트 전체의 자동 메모를 포기한다
 * (react-hooks/purity). 만료·마감 판정처럼 **분 단위면 충분한** 표시를 이 시계로 옮긴다.
 *
 * - 서버 스냅샷도 시각을 돌려준다 — `null`(마운트 전 빈 자리)이면 첫 페인트의 "N시간 남음"·마감 여부가 비어 보인다.
 *   값이 분 단위라 서버 HTML과 하이드레이션 값은 분 경계를 넘을 때만 다르고, 종전(렌더마다 `Date.now()`)과 같은 수준이다.
 * - 1분마다 다시 그린다(종전에는 부모가 다시 그릴 때만 갱신됐다 — 마감이 화면에 그대로 있는 동안 반영되는 쪽이 더 정확하다).
 * - 같은 분 안에서는 같은 값을 돌려줘 useSyncExternalStore의 스냅샷 캐시 규칙을 지킨다.
 */
const minuteNow = () => Math.floor(Date.now() / 60_000) * 60_000;

function subscribe(cb: () => void): () => void {
  const id = setInterval(cb, 60_000);
  return () => clearInterval(id);
}

export function useNowMinuteMs(): number {
  return useSyncExternalStore(subscribe, minuteNow, minuteNow);
}
