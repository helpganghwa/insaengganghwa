import type { ReactNode } from 'react';
import Link from 'next/link';

import type { WorldEventEntry } from '@/lib/game/world/event';
import { profileHref } from '@/lib/game/profile/href';

// 강조 색 — 핵심 토큰에만(GuildLogFeed와 통일).
const C = {
  amber: 'text-amber-600 dark:text-amber-400',
  // 길드색 — 한 단계 톤다운(눈에 덜 띄게)
  emerald: 'text-emerald-700 dark:text-emerald-500',
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

/** 유저 토큰 — link=true면 프로필 링크(피드용), false면 일반 강조 텍스트(티커=바 전체가 링크라 중첩 a 금지). */
function userNode(
  code: string | null,
  nick: string | null,
  serverId: number,
  link: boolean,
): ReactNode {
  const label = nick ?? '알 수 없음';
  // 유저색 — 한 단계 톤다운(눈에 덜 띄게)
  if (!link || !code) return <span className="font-semibold text-sky-700 dark:text-sky-500">{label}</span>;
  return (
    <Link
      href={profileHref(code, serverId)}
      className="font-semibold text-sky-700 hover:underline dark:text-sky-500"
    >
      {label}
    </Link>
  );
}

/** 월드 이벤트 1줄 메시지(피드·티커 공용). opts.link=true면 닉네임이 프로필 링크. */
export function worldEventMessage(e: WorldEventEntry, opts?: { link?: boolean }): ReactNode {
  const link = opts?.link ?? false;
  const actor = userNode(e.actorCode, e.actorNickname, e.serverId, link);
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

/** KST 'YYYY-MM-DD HH:mm:ss' — 수동 오프셋(서버/클라 동일, 하이드레이션 안전). */
export function fmtWorldTime(iso: string): string {
  const dt = new Date(Date.parse(iso) + 9 * 3600 * 1000);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${dt.getUTCFullYear()}-${p(dt.getUTCMonth() + 1)}-${p(dt.getUTCDate())} ${p(dt.getUTCHours())}:${p(dt.getUTCMinutes())}:${p(dt.getUTCSeconds())}`;
}
