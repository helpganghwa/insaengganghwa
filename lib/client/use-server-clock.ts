'use client';

import { useEffect, useState } from 'react';

import { isServerClockEstablished, serverNow, setServerNow } from './server-clock';

/**
 * 서버 시각으로 시작하는 1초 시계(2026-09-14).
 *
 * 카운트다운 화면들이 `useState(() => Date.now())`로 **폰 시계**를 그대로 썼다. 두 가지가 걸렸다.
 *  ① 시계가 밀린 기기에서 서버 판정과 표시가 어긋난다 — 강화·파견에서 이미 겪고 2026-08-28에
 *     `serverNow()`(server-clock.ts)로 고쳤는데, 대난투·레이드·점령전 카드는 빠져 있었다.
 *     대난투는 자동 폴링 시점까지 이 시계로 판정해, 시계가 밀리면 발표가 나도 화면이 안 넘어갔다.
 *  ② SSR에서 `Date.now()`(서버 시계)로 그린 뒤 하이드레이션에서 다시 계산해 텍스트가 어긋난다
 *     (초 단위 표기라 초 경계를 넘으면 React #418).
 *
 * ⚠ 흔한 해법인 "마운트 전 null"은 ②만 고치고 **빈 자리를 만든다.** SSR HTML은 JS가 오기 전에
 * 이미 그려지므로, useLayoutEffect를 써도 하이드레이션이 끝날 때까지 타이머 자리가 비어 보인다
 * (모바일에서 수백 ms~수 초). 그래서 **서버 시각을 prop으로 받아 초기값으로 쓴다** —
 * SSR과 하이드레이션이 같은 문자열에서 같은 숫자를 만들어 불일치가 없고, 첫 페인트부터 값이 있다.
 *
 * 마운트 뒤에는 offset을 등록하고 `serverNow()`로 갱신한다. offset은 전송 지연만큼 음수로
 * 치우쳐(클라가 서버보다 뒤라고 봄) "아직 안 됐다" 쪽으로 보수적이다.
 *
 * @param nowIso 서버 컴포넌트가 렌더 시각으로 내려준 ISO 문자열. 라우트가 동적(요청마다 렌더)이어야
 *   신선하다 — 캐시된 페이지에 쓰면 상한 시각으로 시작한다.
 */
export function useServerClock(nowIso: string, intervalMs = 1000): number {
  const [now, setNow] = useState(() => {
    // 이미 보정된 세션(클라 내비게이션·뒤로가기 복원)이면 prop보다 보정 시계가 정확하다 — prop은 캐시된
    // 옛 값일 수 있다. 첫 로드(하이드레이션)에서는 서버·클라 모두 미등록이라 같은 prop으로 같은 값을 만든다.
    if (isServerClockEstablished()) return serverNow();
    const t = Date.parse(nowIso);
    // 잘못된 값이 와도 화면이 죽지 않게 — 폰 시계로 폴백(종전 동작과 동일).
    return Number.isFinite(t) ? t : Date.now();
  });
  useEffect(() => {
    setServerNow(nowIso);
    // ⚠ 여기서 setNow를 한 번 더 부르지 않는다 — `setServerNow` 직후 `serverNow()`는 정확히
    // `Date.parse(nowIso)`(= 초기값)를 돌려주므로 값이 같고, 렌더만 한 번 더 돌 뿐이다.
    // 첫 갱신은 아래 인터벌이 1초 뒤에 하고, 그때부터 offset이 반영돼 정상적으로 흐른다.
    const t = setInterval(() => setNow(serverNow()), intervalMs);
    return () => clearInterval(t);
  }, [nowIso, intervalMs]);
  return now;
}
