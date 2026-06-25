'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';

import type { WorldEventEntry } from '@/lib/game/world/event';
import { profileHref } from '@/lib/game/profile/href';

// 강조 색 — 줄 전체가 아니라 '중요 포인트' 토큰에만(GuildLogFeed와 통일).
const C = {
  amber: 'text-amber-600 dark:text-amber-400',
  emerald: 'text-emerald-600 dark:text-emerald-400',
  violet: 'text-violet-600 dark:text-violet-400',
};
const hl = (text: string, cls: string) => <span className={`font-semibold ${cls}`}>{text}</span>;

const METRIC_LABEL: Record<string, string> = {
  max: '최고 강화',
  sum: '합산 강화',
  combat: '전투력',
  raid: '레이드 처치',
  melee: '대난투 우승',
};

/** 유저 — 클릭 시 프로필 상세(/u/<공개코드>?s=서버). 코드 없으면 일반 텍스트. */
function user(code: string | null, nick: string | null, serverId: number): ReactNode {
  const label = nick ?? '알 수 없음';
  if (!code) return <span className="font-semibold">{label}</span>;
  return (
    <Link
      href={profileHref(code, serverId)}
      className="font-semibold text-sky-600 hover:underline dark:text-sky-400"
    >
      {label}
    </Link>
  );
}

// KST 'YYYY-MM-DD HH:mm:ss' — 수동 오프셋(서버/클라 동일, 하이드레이션 안전).
function fmtFull(iso: string): string {
  const d = new Date(Date.parse(iso) + 9 * 3600 * 1000);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`;
}

function message(e: WorldEventEntry): ReactNode {
  const actor = user(e.actorCode, e.actorNickname, e.serverId);
  const d = e.detail ?? {};
  const item = (d.item as string) ?? '장비';
  const level = (d.level as number) ?? 0;
  const rank = (d.rank as number) ?? 0;
  const guildName = (d.guildName as string) ?? '길드';
  const metric = (d.metric as string) ?? '';
  const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : '';
  switch (e.type) {
    case 'melee_rank':
      return <>{actor}님이 대난투 {hl(`${medal}${rank}위`, C.amber)}에 올랐습니다</>;
    case 'enhance':
      return <>{actor}님이 {item} {hl(`+${level} 강화`, C.amber)}에 성공했습니다</>;
    case 'transcend':
      return <>{actor}님이 {item} {hl(`초월 +${level}`, C.violet)}을 달성했습니다</>;
    case 'guild_create':
      return <>{actor}님이 {hl(guildName, C.emerald)} 길드를 결성했습니다</>;
    case 'guild_power_1':
      return <>{hl(guildName, C.emerald)} 길드가 {hl('전투력 1위', C.amber)}에 올랐습니다</>;
    case 'guild_zone_1':
      return <>{hl(guildName, C.emerald)} 길드가 {hl('점령지 1위', C.emerald)}에 올랐습니다</>;
    case 'rank_leader':
      return <>{actor}님이 {hl(`${METRIC_LABEL[metric] ?? metric} 1위`, C.amber)}에 올랐습니다</>;
    default:
      return e.type;
  }
}

/** 월드 소식 피드 — 서버 전체 주목 사건(GuildLogFeed와 동일 컴팩트 스타일). 최신순 스크롤. */
export function WorldLogFeed({ entries }: { entries: WorldEventEntry[] }) {
  if (entries.length === 0) {
    return <p className="px-1 py-3 text-center text-[11px] text-zinc-400">아직 월드 소식이 없습니다.</p>;
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
