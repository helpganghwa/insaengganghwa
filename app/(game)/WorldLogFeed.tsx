'use client';

import type { WorldEventEntry } from '@/lib/game/world/event';
import { worldEventMessage, fmtWorldTime } from './world-message';

/**
 * 월드 소식 피드 — 서버 전체 주목 사건. full=true(상세 /world)면 말줄임 없이 전체 줄바꿈·전건,
 * 기본(컴팩트)이면 한 줄 truncate + 스크롤 박스. 닉네임은 프로필 링크.
 */
export function WorldLogFeed({ entries, full = false }: { entries: WorldEventEntry[]; full?: boolean }) {
  if (entries.length === 0) {
    return <p className="px-1 py-3 text-center text-[11px] text-zinc-400">아직 월드 소식이 없습니다.</p>;
  }
  return (
    // 미리보기에도 내부 스크롤 박스 금지(길드 로그와 동일, 2026-07-27) — overscroll-contain이
    // 터치를 소비해 페이지 스크롤을 막는다. 미리보기는 건수 제한으로 해결.
    <ul className="divide-y divide-zinc-100 dark:divide-zinc-900">
      {entries.map((e) => (
        <li
          key={e.id}
          className={`flex gap-2 ${full ? 'items-start px-3 py-1 text-[11px] leading-snug' : 'items-center py-1 text-[11px] leading-tight'}`}
        >
          <span
            className={`min-w-0 flex-1 text-zinc-700 dark:text-zinc-300 ${full ? 'whitespace-normal break-words' : 'truncate'}`}
          >
            {worldEventMessage(e, { link: true })}
          </span>
          <span className="shrink-0 font-mono text-[9px] tabular-nums text-zinc-400">
            {fmtWorldTime(e.createdAtIso)}
          </span>
        </li>
      ))}
    </ul>
  );
}
