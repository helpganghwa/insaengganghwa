'use client';

import { useEffect, useState } from 'react';

/**
 * 로그인 화면 서버 셀렉터(SERVER.md §3) — 서버명 칩만 노출(설명 없음), 추천 서버에 라벨.
 * **사용자가 실제로 클릭했을 때만** `login_srv` 쿠키(10분)에 기록 — OAuth 왕복 후 콜백이 읽어
 * 활성 서버 확정. ⚠ 마운트 즉시 기본값을 기록하면 콜백의 `last_server_id` 복원(기기 변경
 * 유저)이 항상 가려져, 신서버 오픈 후 기존 유저가 빈 신서버에 오배정된다(2026-07-10 감사 R1).
 * 미클릭 시 콜백 기본 체인(last_server_id → pending_server(초대 링크) → 추천 서버)이 서버를 정한다.
 *
 * ⚠ **선택 표시는 아는 경우에만**(2026-09-21 ②). 로그인 전이라 이 화면은 그 사람이 어느 서버를
 * 쓰던 사람인지 모른다. 종전에는 모를 때도 최신 서버를 선택된 것처럼 칠해 뒀는데, 실제 배정은
 * `last_server_id` 복원이라 화면과 결과가 어긋났고 그 칩을 "확인하려고" 누른 기존 유저에게 새
 * 캐릭터가 생겼다. 이제 이 기기에서 마지막으로 쓴 서버(`knownSrv`)가 있을 때만 그 칩을 칠하고,
 * 없으면 아무것도 칠하지 않는다. 칠해진 칩은 **표시일 뿐** `login_srv`를 쓰지 않는다 —
 * 안 누르고 로그인하면 콜백의 복원이 같은 서버로 데려간다.
 */
export function ServerPicker({
  servers,
  knownSrv,
  recommendedId,
}: {
  servers: { id: number; name: string; status: string }[];
  /** 이 기기에서 마지막으로 쓴 서버(srv 쿠키) — 없거나 닫힌 서버면 null. */
  knownSrv: number | null;
  /** 신규의 기본 서버(운영자 지정, 없으면 최신 open) — '추천' 라벨 대상. */
  recommendedId: number;
}) {
  const [picked, setPicked] = useState<number | null>(knownSrv);

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
          // 포화(full)는 **신규 생성만** 막는 상태다(SERVER.md §6) — 기존 유저는 골라 들어올 수
          // 있어야 한다. 종전에는 open만 눌려서, 두 서버를 하는 사람이 포화 서버로 못 돌아갔다.
          // 닫힘(closed)만 비활성. 포화 서버에 캐릭터가 없는 사람이 고르면 콜백·확인 화면이 막는다.
          const open = sv.status === 'open' || sv.status === 'full';
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
              {sv.id === recommendedId && sv.status === 'open' && (
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
