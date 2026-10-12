'use client';

import { useEffect, useState } from 'react';

/**
 * 활성 서버 교정(2026-09-21) — 쿠키가 내 캐릭터가 없는 서버를 가리킬 때 헤더가 이 컴포넌트만 그린다.
 * 화면에는 아무것도 없고, 마운트되자마자 교정 라우트(`/auth/switch-server`)로 **문서 이동**한다.
 *
 * 서버 컴포넌트의 `redirect()`를 쓰지 않는 이유: 헤더는 Suspense 안에서 스트리밍되므로 그 시점의
 * redirect는 307이 아니라 클라 라우터가 처리하는데, 그 처리 중에 Next 라우터 내부에서
 * "Rendered more hooks than during the previous render"가 난다(이동은 되지만 잡히지 않은 예외가 남는다).
 * 문서 이동은 라우터를 거치지 않아 그 문제가 없고, 쿠키를 바꾸는 라우트라 어차피 전체 새로고침이 맞다.
 *
 * 대상 세 가지(10-12): 숫자 = 그 서버로 전환 · 'closed' = 캐릭터가 닫힌 서버에만 있어 운영 종료 안내(/server-closed) ·
 * 'signout' = 탈퇴한 계정의 아직 유효한 토큰(다른 기기)이라 캐릭터를 다시 만들지 않고 로그아웃(3차 검사 B1).
 */
const GUARD_KEY = 'ig:srv-correct';
const WINDOW_MS = 15_000;
const MAX_TRIES = 2;

export type ServerCorrectTarget = number | 'closed' | 'signout';

export function ServerCorrect({ to }: { to: ServerCorrectTarget }) {
  const [stuck, setStuck] = useState(false);
  useEffect(() => {
    // 닫힌 서버 안내·로그아웃은 (game) 레이아웃 밖으로 나가므로 왕복이 생기지 않는다 — 가드 없이 바로 간다.
    if (to === 'closed') {
      window.location.replace('/server-closed');
      return;
    }
    if (to === 'signout') {
      window.location.replace('/auth/signout');
      return;
    }
    // 되돌린 서버에서도 또 교정이 뜨는 비정상 상황이면 무한 왕복하지 않는다(15초 안에 2번까지만).
    try {
      const raw = sessionStorage.getItem(GUARD_KEY);
      const prev = raw ? (JSON.parse(raw) as { at: number; n: number }) : null;
      const n = prev && Date.now() - prev.at < WINDOW_MS ? prev.n + 1 : 1;
      if (n > MAX_TRIES) {
        // 종전엔 조용히 멈춰 헤더만 비었다(3차 검사 B5) — 무슨 일인지와 출구를 보여 준다.
        setStuck(true);
        return;
      }
      sessionStorage.setItem(GUARD_KEY, JSON.stringify({ at: Date.now(), n }));
    } catch {
      // 저장소를 못 쓰는 환경 — 가드 없이 진행(교정 라우트는 내 캐릭터가 있는 서버로만 보낸다).
    }
    window.location.replace(`/auth/switch-server?to=${to}`);
  }, [to]);
  if (!stuck || typeof to !== 'number') return null;
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-2 text-[12px] text-zinc-500">
      <span>서버를 맞추지 못했어요.</span>
      <button
        type="button"
        className="font-semibold text-amber-600 underline-offset-2 hover:underline"
        onClick={() => {
          try {
            sessionStorage.removeItem(GUARD_KEY);
          } catch {
            /* 무시 */
          }
          window.location.replace(`/auth/switch-server?to=${to}`);
        }}
      >
        다시 시도
      </button>
    </div>
  );
}
