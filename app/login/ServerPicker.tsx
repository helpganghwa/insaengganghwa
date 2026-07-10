'use client';

import { useEffect, useState } from 'react';

/**
 * 로그인 화면 서버 셀렉터(SERVER.md §3) — 서버명 칩만 노출(설명 없음), 최신 서버에 추천 라벨.
 * **사용자가 실제로 클릭했을 때만** `login_srv` 쿠키(10분)에 기록 — OAuth 왕복 후 콜백이 읽어
 * 활성 서버 확정. ⚠ 마운트 즉시 기본값을 기록하면 콜백의 `last_server_id` 복원(기기 변경
 * 유저)이 항상 가려져, 신서버 오픈 후 기존 유저가 빈 신서버에 오배정된다(2026-07-10 감사 R1).
 * 미클릭 시 콜백 기본 체인(last_server_id → pending_server → 최신 open)이 서버를 정한다.
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

  // 마운트 시 잔존 login_srv 소거 — 직전 시도(중단된 로그인 등)의 선택이 이번 로그인에
  // 유령처럼 적용되는 것 방지. 이후 기록은 오직 사용자 클릭에서만.
  useEffect(() => {
    document.cookie = 'login_srv=; path=/; max-age=0';
  }, []);

  const pick = (id: number) => {
    setPicked(id);
    const secure = location.protocol === 'https:' ? '; secure' : '';
    document.cookie = `login_srv=${id}; path=/; max-age=600; samesite=lax${secure}`;
  };

  // 별도 컨테이너(로그인 버튼과 동일 너비 w-full) + 3열 그리드. 높이는 행 수에 따라 자동.
  return (
    <div className="w-full rounded-xl border border-zinc-200 bg-white p-2 dark:border-zinc-800 dark:bg-zinc-900/50">
      <p className="mb-1.5 text-left text-[10px] font-bold text-zinc-400">서버 선택</p>
      <div className="grid grid-cols-3 gap-1.5">
        {servers.map((sv) => {
          const open = sv.status === 'open';
          const active = sv.id === picked;
          return (
            <button
              key={sv.id}
              type="button"
              disabled={!open}
              onClick={() => pick(sv.id)}
              className={`relative rounded-lg border px-1 py-1.5 text-[12px] font-bold transition ${
                active
                  ? 'border-amber-500 bg-amber-500/10 text-amber-700 dark:text-amber-300'
                  : open
                    ? 'border-zinc-300 bg-white text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300'
                    : 'border-zinc-200 bg-zinc-50 text-zinc-300 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-600'
              }`}
            >
              {/* 이름만 truncate — 버튼에 overflow-hidden을 주면 추천 뱃지(음수 위치)가 잘림 */}
              <span className="block truncate">{sv.name}</span>
              {sv.id === recommendedId && open && (
                <span className="absolute -right-1.5 -top-1.5 rounded-full bg-amber-500 px-1.5 py-px text-[9px] font-bold text-white shadow-sm">
                  추천
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
