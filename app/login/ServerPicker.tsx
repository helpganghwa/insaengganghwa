'use client';

import { useEffect, useState } from 'react';

/**
 * 로그인 화면 서버 셀렉터(SERVER.md §3) — 선택을 `login_srv` 쿠키(10분)에 즉시 기록.
 * OAuth 왕복 후 콜백(또는 테스트 로그인 액션)이 읽어 활성 서버 확정 + 캐릭터 없으면 자동 생성.
 * 폼과 분리된 쿠키 방식이라 카카오/테스트 어떤 로그인 버튼과도 동작.
 */
export function ServerPicker({
  servers,
  defaultSrv,
}: {
  servers: { id: number; name: string; status: string }[];
  defaultSrv: number;
}) {
  const [picked, setPicked] = useState(defaultSrv);

  useEffect(() => {
    document.cookie = `login_srv=${picked}; path=/; max-age=600; samesite=lax`;
  }, [picked]);

  return (
    <fieldset className="w-full rounded-xl border border-zinc-200 bg-white p-3 text-left dark:border-zinc-800 dark:bg-zinc-900">
      <legend className="px-1 text-[11px] font-bold text-zinc-500">서버 선택</legend>
      <div className="flex flex-wrap gap-2">
        {servers.map((sv) => {
          const open = sv.status === 'open';
          const active = sv.id === picked;
          return (
            <button
              key={sv.id}
              type="button"
              disabled={!open}
              onClick={() => setPicked(sv.id)}
              className={`rounded-lg border px-3 py-1.5 text-[12px] font-bold transition ${
                active
                  ? 'border-amber-500 bg-amber-500/10 text-amber-700 dark:text-amber-300'
                  : open
                    ? 'border-zinc-300 text-zinc-600 dark:border-zinc-700 dark:text-zinc-300'
                    : 'border-zinc-200 text-zinc-400 opacity-60 dark:border-zinc-800'
              }`}
            >
              {sv.name}
              {!open && <span className="ml-1 text-[9px] font-semibold">({sv.status === 'full' ? '신규 제한' : '준비 중'})</span>}
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-[10px] leading-relaxed text-zinc-400">
        서버마다 캐릭터·진행이 분리됩니다. 처음 가는 서버는 새 캐릭터로 시작해요. 서버 변경은
        로그아웃 후 여기서.
      </p>
    </fieldset>
  );
}
