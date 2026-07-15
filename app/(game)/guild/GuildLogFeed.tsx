'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';

import type { GuildLogEntry } from '@/lib/game/guild/activity-log';
import { profileHref } from '@/lib/game/profile/href';
import { milestoneLabel } from '@/lib/game/milestone';
import { transcendStyle } from '@/lib/game/equipment/transcend';

// 강조 색 — '중요 포인트' 토큰에만, 업적은 월드 피드와 동일 배색(강화=앰버·1위/랭킹=스카이·기록=에메랄드·대난투=바이올렛).
const C = {
  amber: 'text-amber-600 dark:text-amber-400',
  emerald: 'text-emerald-600 dark:text-emerald-400',
  red: 'text-red-600 dark:text-red-400',
  sky: 'text-sky-600 dark:text-sky-400',
  violet: 'text-violet-600 dark:text-violet-400',
};
const hl = (text: string, cls: string) => <span className={`font-semibold ${cls}`}>{text}</span>;

/** 유저 — 클릭 시 프로필 상세(/u/<공개코드>?s=서버). 코드 없으면 일반 텍스트. */
function user(code: string | null, nick: string | null, serverId: number): ReactNode {
  const label = nick ?? '알 수 없음';
  // 닉네임 색 — 월드 로그/연대기 인물색과 동일(스톤)
  if (!code) return <span className="font-semibold text-stone-500 dark:text-stone-400">{label}</span>;
  return (
    <Link
      href={profileHref(code, serverId)}
      className="font-semibold text-stone-500 hover:underline dark:text-stone-400"
    >
      {label}
    </Link>
  );
}

// 개인 랭킹 5종 1위 — 메트릭 라벨(월드 로그와 동일 문구).
const METRIC_LABEL: Record<string, string> = {
  max: '최고 강화',
  sum: '합산 강화',
  combat: '전투력',
  raid: '레이드 처치',
  melee: '대난투 우승',
};

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
  const actor = user(e.actorCode, e.actorNickname, e.serverId);
  const target = user(e.targetCode, e.targetNickname, e.serverId);
  const zone = (e.detail?.zone as string) ?? '구역';
  const amt = amountOf(e.detail);
  const item = (e.detail?.item as string) ?? '장비';
  const level = (e.detail?.level as number) ?? 0;
  const rank = (e.detail?.rank as number) ?? 0;
  const metric = (e.detail?.metric as string) ?? '';
  const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : '';
  switch (e.action) {
    case 'join':
      return e.detail?.founder ? <>{actor}님이 길드를 결성했습니다</> : <>{actor}님이 길드에 가입했습니다</>;
    case 'leave':
      return <>{actor}님이 길드를 떠났습니다</>;
    case 'levelup':
      return <>길드가 {hl(`Lv.${(e.detail?.level as number) ?? '?'}`, C.amber)} 달성했습니다</>;
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
      return <>{actor}님이 {target}님을 {hl('부길드장', C.sky)}으로 임명했습니다</>;
    case 'unset_vice':
      return <>{actor}님이 {target}님의 부길드장을 해제했습니다</>;
    case 'set_join_policy':
      return <>{actor}님이 가입 방식을 변경했습니다</>;
    case 'notice_edit':
      return e.detail?.cleared ? (
        <>{actor}님이 공지를 삭제했습니다</>
      ) : (
        <>{actor}님이 {hl('공지', C.sky)}를 수정했습니다</>
      );
    case 'auto_handover':
      return <>{target}님에게 {hl('길드장이 자동 위임', C.violet)}되었습니다</>;
    // 업적 — 멤버.
    case 'achv_enhance':
      return <>{actor}님이 {item} {hl(`+${level} 강화`, C.amber)}에 성공했습니다</>;
    case 'achv_transcend': {
      // +N 색상 = 그 초월 단계(색 등급)색과 동일.
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
    case 'achv_melee':
      return <>{actor}님이 대난투 {hl(`${medal}${rank}위`, C.violet)}에 올랐습니다</>;
    case 'achv_rank_leader':
      return <>{actor}님이 {hl(`👑 ${METRIC_LABEL[metric] ?? metric} 1위`, C.sky)}에 올랐습니다</>;
    case 'achv_milestone':
      return <>{actor}님이 {hl(`${milestoneLabel(metric, (e.detail?.milestone as number) ?? 0)} 달성`, C.emerald)}했습니다</>;
    // 업적 — 길드.
    case 'achv_guild_power_rank':
      return <>길드가 전투력 랭킹 {hl(`${medal}${rank}위`, C.sky)}를 달성했습니다</>;
    case 'achv_guild_zone_rank':
      return <>길드가 점령지 랭킹 {hl(`${medal}${rank}위`, C.sky)}를 달성했습니다</>;
    default:
      return e.action;
  }
}

/**
 * 길드 활동 로그 피드 — 핵심 토큰만 색상 + 전체 타임스탬프, 최신순. 월드 로그와 동일 패턴:
 * full=true(상세 /guild/log)면 말줄임 없이 전체 줄바꿈·전건, 기본(미리보기)이면 한 줄 truncate + 스크롤.
 */
export function GuildLogFeed({ entries, full = false }: { entries: GuildLogEntry[]; full?: boolean }) {
  if (entries.length === 0) {
    return <p className="px-1 py-3 text-center text-[11px] text-zinc-400">아직 활동 기록이 없습니다.</p>;
  }
  return (
    <ul
      className={`divide-y divide-zinc-100 dark:divide-zinc-900 ${
        full ? '' : 'max-h-80 overflow-y-auto overscroll-contain'
      }`}
    >
      {entries.map((e) => (
        <li
          key={e.id}
          className={`flex gap-2 ${full ? 'items-start px-3 py-1 text-[11px] leading-snug' : 'items-center py-1 text-[11px] leading-tight'}`}
        >
          <span
            className={`min-w-0 flex-1 text-zinc-700 dark:text-zinc-300 ${full ? 'whitespace-normal break-words' : 'truncate'}`}
          >
            {message(e)}
          </span>
          <span className="shrink-0 font-mono text-[9px] tabular-nums text-zinc-400">
            {fmtFull(e.createdAtIso)}
          </span>
        </li>
      ))}
    </ul>
  );
}
