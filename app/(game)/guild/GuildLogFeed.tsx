'use client';

import { useEffect, useState } from 'react';

import type { GuildLogEntry } from '@/lib/game/guild/activity-log';

// 이모지 없이 카테고리 컬러로 구분 — 좌측 점(dot) + 핵심 이벤트는 텍스트 컬러 하이라이트.
const STYLE: Record<string, { dot: string; text?: string }> = {
  join: { dot: 'bg-emerald-500' },
  leave: { dot: 'bg-zinc-400 dark:bg-zinc-500' },
  levelup: { dot: 'bg-amber-500', text: 'font-semibold text-amber-600 dark:text-amber-400' },
  tax_collect: { dot: 'bg-yellow-500' },
  tax_distribute: { dot: 'bg-sky-500' },
  zone_capture: { dot: 'bg-emerald-500', text: 'font-semibold text-emerald-600 dark:text-emerald-400' },
  zone_lost: { dot: 'bg-red-500', text: 'font-semibold text-red-600 dark:text-red-400' },
  kick: { dot: 'bg-red-500', text: 'text-red-600 dark:text-red-400' },
  transfer_leadership: { dot: 'bg-violet-500', text: 'text-violet-600 dark:text-violet-400' },
  auto_handover: { dot: 'bg-violet-500', text: 'text-violet-600 dark:text-violet-400' },
  set_vice: { dot: 'bg-sky-500' },
  unset_vice: { dot: 'bg-zinc-400 dark:bg-zinc-500' },
  set_join_policy: { dot: 'bg-zinc-400 dark:bg-zinc-500' },
};
const DEFAULT_STYLE = { dot: 'bg-zinc-400 dark:bg-zinc-500' } as const;

function amountOf(detail: Record<string, unknown> | null): string {
  const a = detail?.amount;
  const n = typeof a === 'string' ? Number(a) : typeof a === 'number' ? a : 0;
  return Number.isFinite(n) ? n.toLocaleString('ko-KR') : '0';
}

function relTime(iso: string, nowMs: number): string {
  const diff = nowMs - new Date(iso).getTime();
  if (diff < 60_000) return '방금';
  const m = Math.floor(diff / 60_000);
  if (m < 60) return `${m}분 전`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}시간 전`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}일 전`;
  const dt = new Date(iso);
  return `${dt.getMonth() + 1}/${dt.getDate()}`;
}

function message(e: GuildLogEntry): string {
  const actor = e.actorNickname ?? '알 수 없음';
  const target = e.targetNickname ?? '알 수 없음';
  const zone = (e.detail?.zone as string) ?? '구역';
  switch (e.action) {
    case 'join':
      return e.detail?.founder ? `${actor}님이 길드를 결성했어요` : `${actor}님이 가입했어요`;
    case 'leave':
      return `${actor}님이 길드를 떠났어요`;
    case 'levelup':
      return `길드가 Lv.${(e.detail?.level as number) ?? '?'} 달성!`;
    case 'tax_collect':
      return `${actor}님이 세금 ${amountOf(e.detail)}💎를 수금했어요`;
    case 'tax_distribute':
      return `${actor}님이 세금 ${amountOf(e.detail)}💎를 분배했어요`;
    case 'zone_capture':
      return `${zone} 점령!`;
    case 'zone_lost':
      return `${zone} 상실`;
    case 'kick':
      return `${actor}님이 ${target}님을 추방했어요`;
    case 'transfer_leadership':
      return `${actor}님이 ${target}님에게 길드장을 위임했어요`;
    case 'set_vice':
      return `${target}님이 부길드장이 되었어요`;
    case 'unset_vice':
      return `${target}님의 부길드장이 해제됐어요`;
    case 'set_join_policy':
      return '가입 방식이 변경됐어요';
    case 'auto_handover':
      return `${target}님에게 길드장이 자동 위임됐어요`;
    default:
      return e.action;
  }
}

/** 길드 활동 로그 피드 — 홈 섹션. 최신순, 최대 100건 스크롤. 상대시각은 마운트 후 표시(hydration 안정). */
export function GuildLogFeed({ entries }: { entries: GuildLogEntry[] }) {
  const [nowMs, setNowMs] = useState(0);
  // 마운트 후 rAF로 현재시각 주입(상대시각 표시) — 동기 setState-in-effect 회피(LocalToggle 패턴).
  useEffect(() => {
    const id = requestAnimationFrame(() => setNowMs(Date.now()));
    return () => cancelAnimationFrame(id);
  }, []);

  if (entries.length === 0) {
    return <p className="px-1 py-3 text-center text-[12px] text-zinc-400">아직 활동 기록이 없어요.</p>;
  }
  return (
    <ul className="max-h-72 space-y-0.5 overflow-y-auto overscroll-contain pr-1">
      {entries.map((e) => {
        const st = STYLE[e.action] ?? DEFAULT_STYLE;
        return (
          <li key={e.id} className="flex items-center gap-2 rounded-lg px-1.5 py-1.5 text-[12px]">
            <span aria-hidden className={`h-1.5 w-1.5 shrink-0 rounded-full ${st.dot}`} />
            <span className={`min-w-0 flex-1 truncate ${st.text ?? 'text-zinc-700 dark:text-zinc-300'}`}>
              {message(e)}
            </span>
            <span className="shrink-0 text-[10px] tabular-nums text-zinc-400">
              {nowMs ? relTime(e.createdAtIso, nowMs) : ''}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
