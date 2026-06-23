'use client';

import type { ReactNode } from 'react';

import type { GuildLogEntry } from '@/lib/game/guild/activity-log';

// 강조 색 — 줄 전체가 아니라 '중요 포인트' 토큰에만 적용.
const C = {
  amber: 'text-amber-600 dark:text-amber-400',
  emerald: 'text-emerald-600 dark:text-emerald-400',
  red: 'text-red-600 dark:text-red-400',
  sky: 'text-sky-600 dark:text-sky-400',
  violet: 'text-violet-600 dark:text-violet-400',
};
const hl = (text: string, cls: string) => <span className={`font-semibold ${cls}`}>{text}</span>;

function amountOf(detail: Record<string, unknown> | null): string {
  const a = detail?.amount;
  const n = typeof a === 'string' ? Number(a) : typeof a === 'number' ? a : 0;
  return Number.isFinite(n) ? n.toLocaleString('ko-KR') : '0';
}

// KST 'YYYY-MM-DD HH:mm:ss' — 수동 오프셋 계산이라 서버/클라 동일(하이드레이션 안전).
function fmtFull(iso: string): string {
  const d = new Date(Date.parse(iso) + 9 * 3600 * 1000);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`;
}

function message(e: GuildLogEntry): ReactNode {
  const actor = e.actorNickname ?? '알 수 없음';
  const target = e.targetNickname ?? '알 수 없음';
  const zone = (e.detail?.zone as string) ?? '구역';
  const amt = amountOf(e.detail);
  switch (e.action) {
    case 'join':
      return e.detail?.founder ? `${actor}님이 길드를 결성했습니다` : `${actor}님이 길드에 가입했습니다`;
    case 'leave':
      return `${actor}님이 길드를 떠났습니다`;
    case 'levelup':
      return <>길드가 {hl(`Lv.${(e.detail?.level as number) ?? '?'}`, C.amber)}을 달성했습니다</>;
    case 'tax_collect':
      return <>{actor}님이 세금 {hl(`${amt}💎`, C.amber)}를 수금했습니다</>;
    case 'tax_distribute':
      return <>{target}님에게 세금 {hl(`${amt}💎`, C.sky)}를 지급했습니다</>;
    case 'zone_capture':
      return <>{zone} 구역을 {hl('점령', C.emerald)}했습니다</>;
    case 'zone_lost':
      return <>{zone} 구역을 {hl('잃었습니다', C.red)}</>;
    case 'kick':
      return <>{actor}님이 {target}님을 {hl('추방', C.red)}했습니다</>;
    case 'transfer_leadership':
      return <>{actor}님이 {target}님에게 {hl('길드장을 위임', C.violet)}했습니다</>;
    case 'set_vice':
      return <>{target}님이 {hl('부길드장', C.sky)}이 되었습니다</>;
    case 'unset_vice':
      return `${target}님의 부길드장이 해제되었습니다`;
    case 'set_join_policy':
      return '가입 방식이 변경되었습니다';
    case 'auto_handover':
      return <>{target}님에게 {hl('길드장이 자동 위임', C.violet)}되었습니다</>;
    default:
      return e.action;
  }
}

/** 길드 활동 로그 피드 — 컴팩트(점 없음·작은 폰트), 핵심 토큰만 색상 + 전체 타임스탬프. 최신순 스크롤. */
export function GuildLogFeed({ entries }: { entries: GuildLogEntry[] }) {
  if (entries.length === 0) {
    return <p className="px-1 py-3 text-center text-[11px] text-zinc-400">아직 활동 기록이 없습니다.</p>;
  }
  return (
    <ul className="max-h-80 divide-y divide-zinc-100 overflow-y-auto overscroll-contain dark:divide-zinc-900">
      {entries.map((e) => (
        <li key={e.id} className="flex items-center gap-2 py-1 text-[11px] leading-tight">
          <span className="min-w-0 flex-1 truncate text-zinc-700 dark:text-zinc-300">{message(e)}</span>
          <span className="shrink-0 font-mono text-[9px] tabular-nums text-zinc-400">
            {fmtFull(e.createdAtIso)}
          </span>
        </li>
      ))}
    </ul>
  );
}
