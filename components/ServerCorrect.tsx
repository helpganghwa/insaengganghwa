'use client';

import { useEffect, useState } from 'react';

/**
 * 활성 서버 교정 안내(2026-09-21 ④) — 쿠키가 내 캐릭터가 없는 서버를 가리킬 때만 뜬다.
 * 종전에는 이 상황에서 그 서버에 **새 캐릭터를 만들어** 버려 진행도가 사라진 것처럼 보였다.
 * 지금은 만들지 않고 원래 서버로 되돌린다 — 잠깐 안내를 보여 준 뒤 교정 라우트로 보낸다
 * (쿠키 변경은 라우트 핸들러에서만 가능).
 */
export function ServerCorrect({ to }: { to: number }) {
  const [failed, setFailed] = useState(false);
  const href = `/auth/switch-server?to=${to}`;

  useEffect(() => {
    // 잠깐 보여 준 뒤 이동 — 화면이 깜빡이고 마는 것보다 무슨 일이 일어났는지 읽히게 한다.
    const t = setTimeout(() => {
      window.location.replace(href);
    }, 1200);
    // 이동이 막히는 환경(팝업 차단·구형 웹뷰) 대비 — 몇 초 뒤에도 그대로면 버튼을 보여 준다.
    const f = setTimeout(() => setFailed(true), 5000);
    return () => {
      clearTimeout(t);
      clearTimeout(f);
    };
  }, [href]);

  return (
    <div className="fixed inset-0 z-[200] flex flex-col items-center justify-center gap-3 bg-zinc-950 px-8 text-center">
      <p className="text-base font-semibold text-white">원래 하던 곳으로 돌아가는 중이에요</p>
      <p className="text-sm leading-relaxed text-zinc-400">
        접속 정보가 초기화돼 다른 곳을 보고 있었어요.
        <br />
        진행하던 내용은 그대로 있습니다.
      </p>
      {failed && (
        <a
          href={href}
          className="mt-2 rounded-lg bg-amber-500 px-5 py-2.5 text-sm font-semibold text-zinc-900"
        >
          계속하기
        </a>
      )}
    </div>
  );
}
