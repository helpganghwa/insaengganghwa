'use client';

import { useRouter } from 'next/navigation';

/**
 * 임시 점검용 — 대난투 화면(실제/대기/진행/집계) 강제 전환 플로팅 버튼.
 * ⚠ 현재 모든 유저에게 노출(곧 제거). preview 파라미터로 MeleeCountdown 상태 강제.
 * ⚠ 점검 후 제거 대상: MeleePreviewSwitcher.tsx + page.tsx의 preview 분기.
 */
const MODES = [
  { key: '', label: '실제' },
  { key: 'before', label: '대기' },
  { key: 'running', label: '진행' },
  { key: 'tally', label: '집계' },
] as const;

export function MeleePreviewSwitcher({ current }: { current: string }) {
  const router = useRouter();
  return (
    <div className="fixed bottom-20 right-3 z-[80] flex flex-col items-end gap-1">
      <span className="rounded bg-black/75 px-1.5 py-0.5 text-[9px] font-bold text-amber-300 backdrop-blur">
        미리보기(임시)
      </span>
      <div className="flex gap-0.5 rounded-full bg-black/75 p-1 shadow-lg backdrop-blur">
        {MODES.map((m) => {
          const active = current === m.key;
          return (
            <button
              key={m.key}
              type="button"
              onClick={() => router.push(m.key ? `/melee?preview=${m.key}` : '/melee')}
              className={`rounded-full px-2.5 py-1 text-[10px] font-bold transition ${
                active ? 'bg-amber-500 text-white' : 'text-zinc-300 active:bg-white/10'
              }`}
            >
              {m.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
