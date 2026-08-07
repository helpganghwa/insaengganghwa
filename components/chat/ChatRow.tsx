'use client';

import { memo, type MouseEvent as ReactMouseEvent } from 'react';

import { TitleTag } from '@/components/TitleTag';
import type { ChatMessageDto } from '@/lib/game/chat/service';
import { worldEventMessage } from '@/app/(game)/world-message';
import { guildLogMessage } from '@/app/(game)/guild/GuildLogFeed';

import { avatarBox, renderMentionBody as renderBody } from './mentionBody';

/**
 * 채팅 한 행 — 전체·길드 탭과 귓속말 스레드가 **같은 파일 하나**를 쓴다(2026-08-07).
 * 귓속말만 말풍선이던 시절엔 같은 사람이 채널마다 다른 모습으로 보여, 길드 문양·칭호처럼
 * 행에만 있는 정보가 1:1 대화에서 통째로 사라졌다. 행을 공유하면 그 비대칭이 구조적으로 없다.
 *
 * 표기 규칙(2026-07-23): 닉네임 → 길드 문양 → 길드명 → 칭호(집행관 흡수) → 시각.
 * content-visibility:auto — 뷰포트 밖 행은 페인트·칭호 무한 애니메이션 프레임까지 스킵,
 * contain-intrinsic-size로 스크롤 높이는 근사 유지(미지원 브라우저는 무시, 동작 동일).
 */

// 시각 포맷터 — 모듈 상수 1개. 행 렌더마다 Intl 인스턴스를 만들면(150행×키 입력) 입력 지연의 직접 요인.
const TIME_FMT = new Intl.DateTimeFormat('ko-KR', { hour: '2-digit', minute: '2-digit' });
const DATE_FMT = new Intl.DateTimeFormat('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' });

/**
 * 날짜 구분선 — 전체·길드·귓속말 **공용**(2026-08-07). 행과 같은 파일에 두는 이유는
 * 목록을 그리는 쪽이 늘 행과 짝으로 쓰기 때문이다(채널마다 다른 선이 생기지 않도록).
 */
export function ChatDateDivider({ label }: { label: string }) {
  return (
    <div className="my-2 flex items-center gap-2">
      <span className="h-px flex-1 bg-zinc-100 dark:bg-zinc-800" />
      <span className="shrink-0 text-[9.5px] text-zinc-400 dark:text-zinc-500">{label}</span>
      <span className="h-px flex-1 bg-zinc-100 dark:bg-zinc-800" />
    </div>
  );
}

/**
 * 앞 항목과 날짜가 바뀌었으면 표시 문자열, 같은 날이면 null. 목록의 첫 항목은 항상 표시.
 * 판정 대상엔 시스템 라인도 포함한다 — 빼면 "시스템 라인 하나 건너 같은 날짜 선이 또"
 * 나오거나, 날이 바뀐 지점이 시스템 라인이면 선이 통째로 사라진다.
 */
export function chatDateLabel(createdAt: string, prevCreatedAt?: string): string | null {
  const d = new Date(createdAt);
  if (!Number.isFinite(d.getTime())) return null;
  if (prevCreatedAt && new Date(prevCreatedAt).toDateString() === d.toDateString()) return null;
  return DATE_FMT.format(d);
}

/**
 * '프로필 보기'/멘션 링크로 나갔다 뒤로가기로 돌아왔을 때의 패널 복원 마크(세션 한정, 1회 소비).
 * 마크를 찍는 쪽이 이 파일(행 안의 링크)이라 키도 여기 둔다 — 도크가 마운트 시 소비한다.
 */
export const RESTORE_KEY = 'ig:chat-restore';

/** 행 내부 링크 클릭 → 뒤로가기 시 패널 복원 마크(마운트 복원 로직이 1회 소비). */
export function markRestoreIfLink(e: ReactMouseEvent) {
  if ((e.target as HTMLElement).closest('a')) {
    try {
      sessionStorage.setItem(RESTORE_KEY, 'panel');
    } catch {
      /* ignore */
    }
  }
}

/**
 * memo 분리(2026-08-06) — 기존엔 인라인 map이라 한 글자 입력·쿨다운 1초 틱마다 최대 150행이
 * 전부 재렌더됐다(전수조사 렉 1위). props가 전부 안정 참조·원시값이라 memo가 실효:
 * 목록은 append 위주(기존 항목 참조 유지), 콜백은 useCallback.
 */
export const ChatRow = memo(function ChatRow({
  m,
  prevMsg,
  me,
  meCode,
  serverId,
  onProfile,
  onReport,
}: {
  m: ChatMessageDto;
  prevMsg: ChatMessageDto | undefined;
  me: string | null;
  meCode: string | null;
  serverId: number;
  onProfile: (userId: string) => void;
  onReport: (m: ChatMessageDto) => void;
}) {
  // 시스템 라인 — 전체=월드 이벤트, 길드=길드 활동 로그. 가운데 정렬 회색.
  if (m.sys || m.sysGuild) {
    return (
      <div
        // 닉네임 링크로 프로필에 갔다 돌아오면 패널을 다시 연다(마운트 복원 소비).
        onClickCapture={markRestoreIfLink}
        className="px-4 py-[3px] text-center text-[10.5px] leading-snug text-zinc-400 dark:text-zinc-500 [content-visibility:auto] [contain-intrinsic-size:auto_22px]"
      >
        {m.sys ? worldEventMessage(m.sys, { link: true }) : guildLogMessage(m.sysGuild!)}
      </div>
    );
  }
  const mine = m.userId === me;
  const pending = m.id.startsWith('tmp-');
  // 같은 유저 1분 내 연속 발언 — 아바타·닉 생략, 본문만 이어붙임(시스템 라인 사이는 미묶음).
  const grouped =
    !!prevMsg &&
    !prevMsg.sys &&
    !prevMsg.sysGuild &&
    prevMsg.userId === m.userId &&
    new Date(m.createdAt).getTime() - new Date(prevMsg.createdAt).getTime() < 60_000;
  const onBodyClick = (e: ReactMouseEvent) => {
    if ((e.target as HTMLElement).closest('a')) return;
    if (!mine && !pending) onReport(m);
  };
  if (grouped) {
    return (
      <div
        className={`flex items-start gap-2 px-1.5 py-[2px] [content-visibility:auto] [contain-intrinsic-size:auto_24px] ${
          mine ? 'bg-amber-50/70 dark:bg-amber-500/[0.07]' : ''
        } ${pending ? 'opacity-50' : ''}`}
      >
        <p
          onClickCapture={markRestoreIfLink}
          onClick={onBodyClick}
          className="min-w-0 flex-1 pl-8 text-[12.5px] leading-[1.45] break-words text-zinc-800 dark:text-zinc-200"
        >
          {renderBody(m.body, m.mentions, meCode, serverId)}
        </p>
      </div>
    );
  }
  return (
    <div
      className={`flex items-start gap-2 px-1.5 py-[5px] [content-visibility:auto] [contain-intrinsic-size:auto_44px] ${
        mine ? 'bg-amber-50/70 dark:bg-amber-500/[0.07]' : ''
      } ${pending ? 'opacity-50' : ''}`}
    >
      <button type="button" onClick={() => onProfile(m.userId)} aria-label={`${m.nickname} 정보`} className="mt-[3px]">
        {avatarBox(m, 'block h-6 w-6')}
      </button>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-1.5 leading-none">
          <button
            type="button"
            onClick={() => onProfile(m.userId)}
            className="truncate text-[11px] font-semibold text-zinc-500 dark:text-zinc-400"
          >
            {m.isMeleeChampion ? '🏆' : ''}
            {m.nickname}
          </button>
          {m.guildEmblemUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={m.guildEmblemUrl}
              alt=""
              loading="lazy"
              decoding="async"
              className="h-3 w-3 shrink-0 self-center object-contain"
              style={{ imageRendering: 'pixelated' }}
            />
          ) : null}
          {m.guildName ? (
            <span className="truncate text-[9.5px] text-zinc-400 dark:text-zinc-500">{m.guildName}</span>
          ) : null}
          {/* 칭호(2026-08-05, 집행관 흡수) — 길드명 우측. shrink-0이라 닉/길드명이 먼저 말줄임된다. */}
          <TitleTag
            code={m.repTitle}
            executorZone={m.executorZone}
            executorZoneRegion={m.executorZoneRegion}
            className="text-[9.5px]"
          />
          <span className="ml-auto shrink-0 text-[9px] text-zinc-300 dark:text-zinc-600">
            {TIME_FMT.format(new Date(m.createdAt))}
          </span>
        </div>
        {/* 본문 탭 = 신고 팝업(별도 신고 버튼 없음, 내 메시지 제외) */}
        <p
          onClickCapture={markRestoreIfLink}
          onClick={onBodyClick}
          className="mt-[3px] text-[12.5px] leading-[1.45] break-words text-zinc-800 dark:text-zinc-200"
        >
          {renderBody(m.body, m.mentions, meCode, serverId)}
        </p>
      </div>
    </div>
  );
});
