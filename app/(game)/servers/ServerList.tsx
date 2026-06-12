'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';

import { useResourceToast } from '@/components/ResourceToast';
import type { ServerListItem } from '@/lib/game/server-select';

import { enterServerAction } from './actions';

const ERR_MSG: Record<string, string> = {
  SERVER_NOT_OPEN: '입장할 수 없는 서버입니다.',
  NICKNAME_TAKEN: '닉네임 생성에 실패했어요. 잠시 후 다시 시도해 주세요.',
  UNKNOWN: '오류가 발생했습니다.',
};

/**
 * 서버 선택 — 이동 버튼 하나(SERVER.md §3). 캐릭터 없는 서버로 이동하면 자동 닉네임으로
 * 새 캐릭터가 만들어져 바로 게임 시작(가입과 동일 무마찰). 오터치 방지로 3초 컨펌만 1회.
 */
export function ServerList({ servers, activeId }: { servers: ServerListItem[]; activeId: number }) {
  const router = useRouter();
  const { showHeaderToast, showError } = useResourceToast();
  const [pending, start] = useTransition();
  // 새 캐릭터 시작 3초 인-버튼 컨펌(프로젝트 표준 패턴).
  const [armed, setArmed] = useState<number | null>(null);
  const [armedLeft, setArmedLeft] = useState(0);
  useEffect(() => {
    if (armed == null) return;
    const t = setInterval(() => {
      setArmedLeft((s) => {
        if (s <= 1) {
          setArmed(null);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [armed]);

  const move = (id: number) =>
    start(async () => {
      const r = await enterServerAction(id);
      if (r.status !== 'success') return showError(ERR_MSG[r.code] ?? ERR_MSG.UNKNOWN!);
      const name = servers.find((s) => s.id === id)?.name ?? '서버';
      showHeaderToast({
        title: r.created ? `${name} 시작 — ${r.created}` : `${name} 입장`,
        ...(r.created ? { detail: '닉네임은 설정에서 1회 무료로 바꿀 수 있어요' } : {}),
      });
      router.push('/');
      router.refresh();
    });

  const onMove = (s: ServerListItem) => {
    if (s.my) return move(s.id); // 기존 캐릭터 — 즉시 이동
    if (armed === s.id) {
      setArmed(null);
      return move(s.id); // 컨펌 완료 — 새 캐릭터로 시작
    }
    setArmed(s.id);
    setArmedLeft(3);
  };

  return (
    <div className="px-4 py-4">
      <h1 className="text-base font-bold">서버 선택</h1>
      <p className="mt-1 text-[11px] leading-relaxed text-zinc-500">
        서버마다 캐릭터·진행·다이아가 분리됩니다. 처음 가는 서버는 이동하면 새 캐릭터로 바로
        시작해요.
      </p>
      <ul className="mt-4 space-y-2">
        {servers.map((s) => (
          <li
            key={s.id}
            className="flex items-center justify-between gap-2 rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950"
          >
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-[13px] font-bold">{s.name}</span>
                {s.id === activeId && (
                  <span className="rounded-full bg-emerald-500/15 px-1.5 text-[9px] font-bold text-emerald-600 dark:text-emerald-400">
                    접속 중
                  </span>
                )}
                {s.status !== 'open' && (
                  <span className="rounded-full bg-zinc-500/15 px-1.5 text-[9px] font-bold text-zinc-500">
                    {s.status === 'full' ? '신규 제한' : '준비 중'}
                  </span>
                )}
              </div>
              <p className="mt-0.5 truncate text-[11px] text-zinc-500">
                {s.my
                  ? `${s.my.nickname} · 💎${Number(s.my.diamond).toLocaleString('ko-KR')}`
                  : '새 캐릭터로 시작'}
              </p>
            </div>
            {s.id === activeId ? null : s.my || s.status === 'open' ? (
              <button
                type="button"
                disabled={pending}
                onClick={() => onMove(s)}
                className={`shrink-0 rounded-lg px-3 py-1.5 text-[12px] font-bold text-white disabled:opacity-40 ${
                  armed === s.id ? 'animate-confirm-bg-pulse bg-red-600' : 'bg-amber-600'
                }`}
              >
                {armed === s.id ? `시작 확인 (${armedLeft})` : '이동'}
              </button>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
