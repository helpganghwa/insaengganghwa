'use client';

import { useEffect } from 'react';

/**
 * 활성 서버 교정(2026-09-21) — 쿠키가 내 캐릭터가 없는 서버를 가리킬 때 헤더가 이 컴포넌트만 그린다.
 * 화면에는 아무것도 없고, 마운트되자마자 교정 라우트(`/auth/switch-server`)로 **문서 이동**한다.
 *
 * 서버 컴포넌트의 `redirect()`를 쓰지 않는 이유: 헤더는 Suspense 안에서 스트리밍되므로 그 시점의
 * redirect는 307이 아니라 클라 라우터가 처리하는데, 그 처리 중에 Next 라우터 내부에서
 * "Rendered more hooks than during the previous render"가 난다(이동은 되지만 잡히지 않은 예외가 남는다).
 * 문서 이동은 라우터를 거치지 않아 그 문제가 없고, 쿠키를 바꾸는 라우트라 어차피 전체 새로고침이 맞다.
 */
const GUARD_KEY = 'ig:srv-correct';
const WINDOW_MS = 15_000;
const MAX_TRIES = 2;

export function ServerCorrect({ to }: { to: number }) {
  useEffect(() => {
    // 되돌린 서버에서도 또 교정이 뜨는 비정상 상황이면 무한 왕복하지 않는다(15초 안에 2번까지만).
    try {
      const raw = sessionStorage.getItem(GUARD_KEY);
      const prev = raw ? (JSON.parse(raw) as { at: number; n: number }) : null;
      const n = prev && Date.now() - prev.at < WINDOW_MS ? prev.n + 1 : 1;
      if (n > MAX_TRIES) return;
      sessionStorage.setItem(GUARD_KEY, JSON.stringify({ at: Date.now(), n }));
    } catch {
      // 저장소를 못 쓰는 환경 — 가드 없이 진행(교정 라우트는 내 캐릭터가 있는 서버로만 보낸다).
    }
    window.location.replace(`/auth/switch-server?to=${to}`);
  }, [to]);
  return null;
}
