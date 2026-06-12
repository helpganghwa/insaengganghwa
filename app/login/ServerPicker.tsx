'use client';

import { useEffect, useState } from 'react';

/**
 * 로그인 화면 서버 셀렉터(SERVER.md §3) — 서버명 칩만 노출(설명 없음), 최신 서버에 추천 라벨.
 * 선택을 `login_srv` 쿠키(10분)에 즉시 기록 — OAuth 왕복 후 콜백(또는 테스트 로그인 액션)이
 * 읽어 활성 서버 확정 + 캐릭터 없으면 자동 생성. 폼과 분리된 쿠키 방식이라 어떤 로그인 버튼과도 동작.
 */
export function ServerPicker({
  servers,
  defaultSrv,
  recommendedId,
}: {
  servers: { id: number; name: string; status: string }[];
  defaultSrv: number;
  /** 최신 open 서버 — '추천' 라벨 대상. */
  recommendedId: number;
}) {
  const [picked, setPicked] = useState(defaultSrv);

  useEffect(() => {
    document.cookie = `login_srv=${picked}; path=/; max-age=600; samesite=lax`;
  }, [picked]);

  return (
    <div className="flex w-full flex-wrap justify-center gap-2">
      {servers.map((sv) => {
        const open = sv.status === 'open';
        const active = sv.id === picked;
        return (
          <button
            key={sv.id}
            type="button"
            disabled={!open}
            onClick={() => setPicked(sv.id)}
            className={`relative rounded-xl border px-4 py-2 text-[13px] font-bold transition ${
              active
                ? 'border-amber-500 bg-amber-500/10 text-amber-700 dark:text-amber-300'
                : open
                  ? 'border-zinc-300 bg-white text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300'
                  : 'border-zinc-200 bg-zinc-50 text-zinc-300 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-600'
            }`}
          >
            {sv.name}
            {sv.id === recommendedId && open && (
              <span className="absolute -right-1.5 -top-1.5 rounded-full bg-amber-500 px-1.5 py-px text-[9px] font-bold text-white shadow-sm">
                추천
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
