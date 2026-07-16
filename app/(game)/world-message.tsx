import type { ReactNode } from 'react';
import Link from 'next/link';

import type { WorldEventEntry } from '@/lib/game/world/event';
import { profileHref } from '@/lib/game/profile/href';
import { transcendStyle } from '@/lib/game/equipment/transcend';
import { milestoneLabel } from '@/lib/game/milestone';

// 강조 색 — 핵심 토큰에만, 사건 종류별 구분(GuildLogFeed와 통일, 2026-07-15 사용자 확정 배색):
// 강화·개인 기록=레드 · 유저 1위 등극=오렌지 · 길드 1위 등극=푸크시아 · 대난투=앰버 · 초월=단계색.
const C = {
  amber: 'text-amber-600 dark:text-amber-400',
  orange: 'text-orange-600 dark:text-orange-400',
  red: 'text-red-600 dark:text-red-400',
  fuchsia: 'text-fuchsia-600 dark:text-fuchsia-400',
  // 길드색 — 세계지도 연대기와 동일(슬레이트)
  guild: 'text-slate-600 dark:text-slate-400',
};
const hl = (text: string, cls: string) => <span className={`font-semibold ${cls}`}>{text}</span>;
// 길드명 — 색은 슬레이트 유지, 굵기만 엑스트라볼드(닉네임과 동급 주체 토큰).
const hb = (text: string, cls: string) => <span className={`font-extrabold ${cls}`}>{text}</span>;

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
  // 유저색 — 세계지도 연대기 인물색과 동일(스톤)
  if (!link || !code) return <span className="font-extrabold text-stone-500 dark:text-stone-400">{label}</span>;
  return (
    <Link
      href={profileHref(code, serverId)}
      className="font-extrabold text-stone-500 hover:underline dark:text-stone-400"
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
      return <>{actor}님이 {item} {hl(`+${level} 강화`, C.red)}에 성공했습니다</>;
    case 'transcend': {
      // +N 색상 = 그 초월 단계(색 등급)색과 동일(GuildLogFeed와 통일).
      const [tr, tg, tb] = transcendStyle(level).colorRgb;
      return (
        <>
          {actor}님이 {item}{' '}
          <span className="font-semibold" style={{ color: `rgb(${tr},${tg},${tb})` }}>
            초월 +{level}
          </span>{' '}
          달성했습니다
        </>
      );
    }
    case 'guild_create':
      return <>{actor}님이 {hb(guildName, C.guild)} 길드를 결성했습니다</>;
    case 'guild_disband': {
      const zs = (d.zones as string[]) ?? [];
      return (
        <>
          {hb(guildName, C.guild)} 길드가 해산했습니다
          {zs.length > 0 ? <> — 구역 {zs.length}곳이 주인을 잃었습니다</> : null}
        </>
      );
    }
    case 'guild_power_1':
      return <>{hb(guildName, C.guild)} 길드가 {hl('전투력 1위', C.fuchsia)}에 올랐습니다</>;
    case 'guild_zone_1':
      return <>{hb(guildName, C.guild)} 길드가 {hl('점령지 1위', C.fuchsia)}에 올랐습니다</>;
    case 'rank_leader':
      return <>{actor}님이 {hl(`${METRIC_LABEL[metric] ?? metric} 1위`, C.orange)}에 올랐습니다</>;
    case 'personal_milestone':
      return <>{actor}님이 {hl(`${milestoneLabel(metric, (d.milestone as number) ?? 0)} 달성`, C.red)}했습니다</>;
    default:
      return e.type;
  }
}

/** KST 'YY-MM-DD HH:mm' — 수동 오프셋(서버/클라 동일, 하이드레이션 안전). 연 2자리·초 생략. */
export function fmtWorldTime(iso: string): string {
  const dt = new Date(Date.parse(iso) + 9 * 3600 * 1000);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(dt.getUTCFullYear() % 100)}-${p(dt.getUTCMonth() + 1)}-${p(dt.getUTCDate())} ${p(dt.getUTCHours())}:${p(dt.getUTCMinutes())}`;
}
