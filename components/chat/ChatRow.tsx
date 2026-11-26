'use client';

import { memo, useRef, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from 'react';

import { TitleTag } from '@/components/TitleTag';
import type { ChatMessageDto, ChatReplyRef } from '@/lib/game/chat/service';
import { worldEventMessage } from '@/app/(game)/world-message';
import { guildLogMessage } from '@/app/(game)/guild/GuildLogFeed';

import { avatarBox, renderMentionBody as renderBody } from './mentionBody';

/**
 * 채팅 한 행 — 전체·길드 탭과 귓속말 스레드가 **같은 파일 하나**를 쓴다(2026-08-07).
 * 귓속말만 말풍선이던 시절엔 같은 사람이 채널마다 다른 모습으로 보여, 길드 문양·칭호처럼
 * 행에만 있는 정보가 1:1 대화에서 통째로 사라졌다. 행을 공유하면 그 비대칭이 구조적으로 없다.
 *
 * 표기 규칙(2026-07-23): 닉네임 → 길드 문양 → 길드명 → 칭호(집행관 흡수) → 시각.
 *
 * ⚠ content-visibility:auto 금지(2026-08-24) — 지연 페인트가 모바일 모멘텀 스크롤을 못
 * 따라가 위로 쓸어올릴 때 빈 화면 노출 + 자리높이 보정 점프가 났다(실기기 녹화 확인).
 * 200행 전체를 오픈 시 1회 페인트하는 쪽이 낫고, 원래 목적이던 "칭호 무한 애니메이션의
 * 스크롤 프레임 경합 방지"는 스크롤 중에만 일시정지하는 useScrollFxPause로 대체한다.
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

/** 밀어서 답장(0254) — 이만큼 왼쪽으로 밀었다 놓으면 답장, 그 이상은 더 따라가지 않는다. */
const SWIPE_TRIGGER = 48;
const SWIPE_MAX = 64;

/**
 * 밀어서 답장 — 터치·펜만(마우스는 본문 탭 팝업의 '답장'으로). 매 이동마다 setState를 하면
 * 150행 목록이 다시 그려지므로 transform을 DOM에 직접 쓴다. 세로 스크롤은 브라우저 몫이라
 * 행에 touch-action: pan-y를 주고, 처음 8px에서 가로로 판정된 경우에만 따라 움직인다.
 */
function useSwipeReply(onTrigger: (() => void) | null) {
  const rowRef = useRef<HTMLDivElement | null>(null);
  const iconRef = useRef<HTMLSpanElement | null>(null);
  const st = useRef<{ x: number; y: number; id: number; dx: number; lock: 'h' | 'v' | null } | null>(null);
  /** 방금 밀기로 끝난 제스처 — 뒤따르는 click(본문 탭 팝업)을 한 번 무시한다. */
  const swipedRef = useRef(false);
  const paint = (dx: number, anim: boolean) => {
    const el = rowRef.current;
    if (el) {
      el.style.transition = anim ? 'transform 0.18s ease-out' : 'none';
      el.style.transform = dx ? `translateX(${dx}px)` : '';
    }
    const ic = iconRef.current;
    if (ic) {
      ic.style.opacity = String(Math.min(1, -dx / SWIPE_TRIGGER));
      ic.style.transform = `scale(${-dx >= SWIPE_TRIGGER ? 1 : 0.8})`;
    }
  };
  const onPointerDown = (e: ReactPointerEvent) => {
    if (!onTrigger || e.pointerType === 'mouse') return;
    st.current = { x: e.clientX, y: e.clientY, id: e.pointerId, dx: 0, lock: null };
    swipedRef.current = false;
  };
  const onPointerMove = (e: ReactPointerEvent) => {
    const s = st.current;
    if (!s || s.id !== e.pointerId) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    if (!s.lock) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      s.lock = dx < 0 && Math.abs(dx) > Math.abs(dy) * 1.2 ? 'h' : 'v';
      if (s.lock === 'v') {
        st.current = null;
        return;
      }
      try {
        (e.currentTarget as Element).setPointerCapture(e.pointerId);
      } catch {
        /* 캡처 실패 — 행 위에서만 따라가도 동작한다 */
      }
    }
    s.dx = Math.max(-SWIPE_MAX, Math.min(0, dx));
    paint(s.dx, false);
  };
  const onPointerEnd = (e: ReactPointerEvent) => {
    const s = st.current;
    if (!s || s.id !== e.pointerId) return;
    st.current = null;
    if (s.lock !== 'h') return;
    swipedRef.current = true;
    if (e.type === 'pointerup' && s.dx <= -SWIPE_TRIGGER) onTrigger?.();
    paint(0, true);
  };
  /** 방금 밀기였으면 true를 돌려주고 표시를 지운다(뒤따르는 click 1회 무시용). */
  const consumeSwiped = () => {
    const v = swipedRef.current;
    swipedRef.current = false;
    return v;
  };
  return {
    rowRef,
    iconRef,
    consumeSwiped,
    handlers: { onPointerDown, onPointerMove, onPointerUp: onPointerEnd, onPointerCancel: onPointerEnd },
  };
}

/** 답장 인용 줄(0254, A안 왼쪽 세로줄) — 누르면 원래 메시지로 이동. 볼 수 없으면 회색 문구. */
function ReplyQuote({ r, onJump }: { r: ChatReplyRef; onJump?: (id: string) => void }) {
  if ('gone' in r) {
    return (
      <div className="mt-[3px] border-l-2 border-zinc-200 pl-2 text-[10.5px] leading-[1.35] text-zinc-400 italic dark:border-zinc-700 dark:text-zinc-500">
        {r.gone === 'deleted' ? '삭제된 메시지입니다' : '볼 수 없는 메시지입니다'}
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onJump?.(r.id);
      }}
      className="mt-[3px] flex w-full min-w-0 items-baseline gap-1 border-l-2 border-amber-500/70 pl-2 text-left text-[10.5px] leading-[1.35]"
    >
      <span className="shrink-0 font-semibold text-zinc-500 dark:text-zinc-400">{r.nick}</span>
      <span className="min-w-0 truncate text-zinc-400 dark:text-zinc-500">{r.body}</span>
    </button>
  );
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
  onDelete,
  onReply,
  onJump,
}: {
  m: ChatMessageDto;
  prevMsg: ChatMessageDto | undefined;
  me: string | null;
  meCode: string | null;
  serverId: number;
  onProfile: (userId: string) => void;
  onReport: (m: ChatMessageDto) => void;
  /** 내 메시지 본문 탭 → 삭제 확인(0177). 없으면 내 메시지 탭은 무동작. */
  onDelete?: (m: ChatMessageDto) => void;
  /** 답장 시작(0254) — 전체·길드만 넘긴다(귓속말은 없음 = 밀기·인용 없음). */
  onReply?: (m: ChatMessageDto) => void;
  /** 인용 줄 탭 → 원래 메시지로 이동. */
  onJump?: (id: string) => void;
}) {
  const pendingId = m.id.startsWith('tmp-');
  const canReply = !!onReply && !m.sys && !m.sysGuild && !m.deleted && !pendingId;
  const swipe = useSwipeReply(canReply ? () => onReply!(m) : null);
  // 시스템 라인 — 전체=월드 이벤트, 길드=길드 활동 로그. 가운데 정렬 회색.
  if (m.sys || m.sysGuild) {
    return (
      <div
        // 닉네임 링크로 프로필에 갔다 돌아오면 패널을 다시 연다(마운트 복원 소비).
        onClickCapture={markRestoreIfLink}
        className="px-4 py-[3px] text-center text-[10.5px] leading-snug text-zinc-400 dark:text-zinc-500"
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
  // 본문 탭 — 남의 메시지=신고, 내 메시지=삭제(0177). 삭제된 자리표시·전송 중은 무동작.
  const onBodyClick = (e: ReactMouseEvent) => {
    if (swipe.consumeSwiped()) return;
    if ((e.target as HTMLElement).closest('a')) return;
    if (m.deleted || pending) return;
    if (mine) onDelete?.(m);
    else onReport(m);
  };
  // 삭제 자리표시 — 회색 이탤릭, 멘션 렌더 없음.
  const BODY_CLS = m.deleted
    ? 'italic text-zinc-400 dark:text-zinc-500'
    : 'text-zinc-800 dark:text-zinc-200';
  const body = m.deleted ? m.body : renderBody(m.body, m.mentions, meCode, serverId);
  const quote = m.reply ? <ReplyQuote r={m.reply} onJump={onJump} /> : null;
  // 밀기 레이어 — 답장 가능한 행만 감싼다. ↩ 원은 opacity 0에서 시작해 민 만큼만 드러난다.
  // overflow-x-clip: 민 만큼 행이 오른쪽 밖으로 나가지 않게(세로는 칭호 광채가 넘칠 수 있어 그대로).
  const wrap = (row: React.ReactNode) =>
    canReply ? (
      <div data-mid={m.id} className="relative overflow-x-clip">
        <span aria-hidden className="pointer-events-none absolute inset-y-0 right-2 flex items-center">
          <span
            ref={swipe.iconRef}
            className="flex h-7 w-7 items-center justify-center rounded-full bg-amber-500 text-[14px] font-bold text-white opacity-0"
          >
            ↩
          </span>
        </span>
        {row}
      </div>
    ) : (
      <div data-mid={m.id}>{row}</div>
    );
  const swipeProps = canReply
    ? { ref: swipe.rowRef, ...swipe.handlers, style: { touchAction: 'pan-y pinch-zoom' } as const }
    : {};
  if (grouped) {
    return wrap(
      <div
        {...swipeProps}
        className={`flex items-start gap-2 px-1.5 py-[2px] ${
          mine ? 'bg-amber-50/70 dark:bg-amber-500/[0.07]' : ''
        } ${pending ? 'opacity-50' : ''}`}
      >
        <div className="min-w-0 flex-1 pl-8">
          {quote}
          <p
            onClickCapture={markRestoreIfLink}
            onClick={onBodyClick}
            className={`${quote ? 'mt-[2px] ' : ''}text-[12.5px] leading-[1.45] break-words ${BODY_CLS}`}
          >
            {body}
          </p>
        </div>
      </div>,
    );
  }
  return wrap(
    <div
      {...swipeProps}
      className={`flex items-start gap-2 px-1.5 py-[5px] ${
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
              decoding="async"
              className="h-3 w-3 shrink-0 self-center object-contain"
              style={{ imageRendering: 'pixelated' }}
            />
          ) : null}
          {m.guildName ? (
            <span className="truncate text-[9.5px] text-zinc-400 dark:text-zinc-500">{m.guildName}</span>
          ) : null}
          {/* 칭호(2026-08-05, 집행관 흡수) — 길드명 우측. shrink-0이라 닉/길드명이 먼저 말줄임된다. */}
          {/* fx는 상시 재생 — 스크롤 중에만 useScrollFxPause(.chat-scrolling)가 일시정지. */}
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
        {quote}
        {/* 본문 탭 = 남의 메시지 신고·답장 팝업 / 내 메시지 삭제·답장 팝업(별도 버튼 없음) */}
        <p
          onClickCapture={markRestoreIfLink}
          onClick={onBodyClick}
          className={`${quote ? 'mt-[2px]' : 'mt-[3px]'} text-[12.5px] leading-[1.45] break-words ${BODY_CLS}`}
        >
          {body}
        </p>
      </div>
    </div>,
  );
});
