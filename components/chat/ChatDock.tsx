'use client';

import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { ModalShell } from '@/components/ModalShell';
import { ModalLayout, ModalButton } from '@/components/ModalLayout';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

import { supabaseBrowser } from '@/lib/supabase-browser';
import { ZoomSafeInput } from '@/components/ui/ZoomSafeField';
import { faceCropStyle, type FaceBox } from '@/components/faceCrop';
import { TitleTag } from '@/components/TitleTag';
import type { ChatMention, ChatMessageDto } from '@/lib/game/chat/service';
import { profileHref } from '@/lib/game/profile/href';
import type { WorldEventEntry } from '@/lib/game/world/event';
import { worldEventMessage } from '@/app/(game)/world-message';
import { guildLogMessage } from '@/app/(game)/guild/GuildLogFeed';
import { sendRequestAction } from '@/app/(game)/friends/actions';

import type { SendChatResult } from '@/lib/game/chat/send';

import { reportChat, setChatBlockAction } from './actions';

/**
 * 전체 채팅 도크(0125, 2026-07-20 확정 UX) —
 *  - GNB 바로 위 fixed 반투명 미니바(최근 1개 메시지) → 탭하면 헤더·GNB 사이를 덮는 불투명 패널
 *  - 수신: Supabase Realtime broadcast 구독, 실패 시 15초 폴링 폴백
 *  - 닉네임/아바타 탭 → 미니 프로필 팝업(전투력·강화·친구추가·신고·차단), 신고도 팝업 확인
 *  - 차단은 로컬(기기) 필터 — localStorage 목록, 서버 부담 0
 *  - 미니바 높이는 --chat-dock-h로 발행(main 하단 패딩), --gt-h(가이드 티커) 합산 오프셋
 *  - 라우트 이동 시 패널 자동 최소화
 */

const COOLDOWN_S = 5;
const DOCK_H = '42px';
// 시각 포맷터 — 모듈 상수 1개. 행 렌더마다 Intl 인스턴스를 만들면(150행×키 입력) 입력 지연의 직접 요인.
const TIME_FMT = new Intl.DateTimeFormat('ko-KR', { hour: '2-digit', minute: '2-digit' });
const COLLAPSE_KEY = 'ig:chat-collapsed';
// '프로필 보기' 이동 후 뒤로가기 복원 — 값=MiniProfile JSON(세션 한정, 마운트 시 1회 소비).
const RESTORE_KEY = 'ig:chat-restore';

type MiniProfile = {
  userId: string;
  nickname: string;
  publicCode: string | null;
  avatar: string | null;
  faceBox: FaceBox | null;
  guildName: string | null;
  guildEmblemUrl: string | null;
  executorZone: string | null;
  executorZoneRegion: string | null;
  repTitle: string | null;
  isMeleeChampion: boolean;
  combat: number;
  maxEnhance: number;
  sumEnhance: number;
  raidKills: number;
  meleeWins: number;
  friendStatus: 'pending' | 'accepted' | null;
  isMe: boolean;
};

type Tab = 'all' | 'guild';

/** 월드 이벤트 broadcast('sys') → 시스템 라인 의사 메시지. */
function sysToMsg(e: WorldEventEntry): ChatMessageDto {
  return {
    id: `sys-${e.id}`,
    userId: '',
    nickname: '',
    publicCode: null,
    avatar: null,
    faceBox: null,
    guildName: null,
    guildEmblemUrl: null,
    executorZone: null,
    executorZoneRegion: null,
    repTitle: null,
    isMeleeChampion: false,
    mentions: null,
    sys: e,
    body: '',
    createdAt: e.createdAtIso,
  };
}

/** 행 내부 링크 클릭 → 뒤로가기 시 패널 복원 마크(마운트 복원 로직이 1회 소비). */
function markRestoreIfLink(e: ReactMouseEvent) {
  if ((e.target as HTMLElement).closest('a')) {
    try {
      sessionStorage.setItem(RESTORE_KEY, 'panel');
    } catch {
      /* ignore */
    }
  }
}

// 멘션 렌더(0128) — 서버가 검증한 유효 멘션만 @ 제거 + 은은한 강조, 닉 클릭 시 프로필 상세.
// 무효 @토큰은 입력한 그대로 일반 텍스트. 색은 절제(내 닉만 약간 진하게).
function renderBody(
  body: string,
  mentions: ChatMention[] | null,
  meNickname: string | null,
  serverId: number,
) {
  return body.split(/(@[^\s@]{1,12})/g).map((part, i) => {
    const nick = part.startsWith('@') ? part.slice(1) : null;
    const hit = nick ? mentions?.find((mm) => mm.n === nick) : null;
    if (nick && hit) {
      const cls =
        meNickname && nick === meNickname
          ? 'font-bold text-amber-600 dark:text-amber-400'
          : 'font-semibold text-amber-600/85 dark:text-amber-400/85';
      if (hit.c) {
        return (
          <Link prefetch={false} key={i} href={profileHref(hit.c, serverId)} className={`${cls} hover:underline`}>
            {nick}
          </Link>
        );
      }
      return (
        <span key={i} className={cls}>
          {nick}
        </span>
      );
    }
    return part;
  });
}

function avatarBox(m: { avatar: string | null; faceBox: FaceBox | null }, size: string) {
  return (
    <span className={`${size} shrink-0 overflow-hidden`}>
      {m.avatar ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={m.avatar}
          alt=""
          loading="lazy"
          decoding="async"
          className="h-full w-full"
          style={faceCropStyle(m.faceBox)}
        />
      ) : (
        <span className="flex h-full w-full items-center justify-center text-[11px]">👤</span>
      )}
    </span>
  );
}

/**
 * 메시지 행(2026-08-06 memo 분리) — 기존엔 인라인 map이라 한 글자 입력·쿨다운 1초 틱마다
 * 최대 150행이 전부 재렌더됐다(전수조사 렉 1위). props가 전부 안정 참조·원시값이라 memo가
 * 실효: 목록은 append 위주(기존 항목 참조 유지), 콜백은 useCallback.
 * content-visibility:auto — 뷰포트 밖 행은 페인트·칭호 무한 애니메이션 프레임까지 스킵(렉 4위),
 * contain-intrinsic-size로 스크롤 높이는 근사 유지. 미지원 브라우저는 무시(동작 동일).
 */
const ChatRow = memo(function ChatRow({
  m,
  prevMsg,
  me,
  meNickname,
  serverId,
  onProfile,
  onReport,
}: {
  m: ChatMessageDto;
  prevMsg: ChatMessageDto | undefined;
  me: string | null;
  meNickname: string | null;
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
          {renderBody(m.body, m.mentions, meNickname, serverId)}
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
          {renderBody(m.body, m.mentions, meNickname, serverId)}
        </p>
      </div>
    </div>
  );
});

export function ChatDock() {
  const router = useRouter();
  const pathname = usePathname();
  const [enabled, setEnabled] = useState<boolean | null>(null); // null=로딩(도크 미표시)
  const [channel, setChannel] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('all');
  const [myGuild, setMyGuild] = useState<{ id: string; name: string } | null>(null);
  const [guildTopic, setGuildTopic] = useState<string | null>(null);
  const [me, setMe] = useState<string | null>(null);
  const [latest, setLatest] = useState<ChatMessageDto | null>(null);
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessageDto[]>([]);
  const [input, setInput] = useState('');
  const [cooldown, setCooldown] = useState(0);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hiddenByTutorial, setHiddenByTutorial] = useState(false);
  const [blocked, setBlocked] = useState<Map<string, string>>(new Map());
  const [showBlockList, setShowBlockList] = useState(false);
  // 미니바 접힘(채팅 안 보기) — 이모지만 남김. 기기 저장으로 유지.
  const [collapsed, setCollapsed] = useState(false);
  // 접힘 중 도착한 새 메시지 — 이모지 버튼에 점 배지, 펼치면 해제.
  const [collapsedUnseen, setCollapsedUnseen] = useState(false);
  // 팝업 — 미니 프로필(로딩=userId만) / 신고 확인.
  const [profile, setProfile] = useState<{ userId: string; data: MiniProfile } | null>(null);
  const [reportTarget, setReportTarget] = useState<ChatMessageDto | null>(null);
  const [popupFlash, setPopupFlash] = useState<string | null>(null);
  // 위로 읽는 중 도착한 새 메시지 — "↓ 새 메시지" 칩. 바닥 근처로 오면 자동 해제.
  const [unseenBelow, setUnseenBelow] = useState(false);
  // iOS 소프트 키보드가 가리는 높이(px) — visualViewport로 측정, 패널 bottom 보정.
  const [kbOffset, setKbOffset] = useState(0);
  // 멘션 하이라이트용 내 닉네임.
  const [meNickname, setMeNickname] = useState<string | null>(null);
  // 멘션 자동완성 — 서버 전체 닉네임 prefix 검색 결과(250ms 디바운스).
  const [searchCands, setSearchCands] = useState<string[]>([]);

  const openRef = useRef(false);
  const collapsedRef = useRef(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  // 폴링의 증분(after) 기준점 — 상태를 effect 의존성에 넣지 않고 최신 목록을 읽기 위한 ref.
  const messagesRef = useRef<ChatMessageDto[]>([]);
  // applyNew(장수명 콜백)에서 내 broadcast를 식별하기 위한 미러 — 상태 me와 동기화.
  const meRef = useRef<string | null>(null);
  const serverIdRef = useRef(1);
  const tabRef = useRef<Tab>('all');
  tabRef.current = tab;
  // 탭별 버퍼(전환 즉시 표시용) — 활성 탭은 messages/latest 상태가 원본, 비활성 탭은 여기.
  const bufRef = useRef<Record<Tab, { messages: ChatMessageDto[]; latest: ChatMessageDto | null }>>({
    all: { messages: [], latest: null },
    guild: { messages: [], latest: null },
  });
  const [sid, setSid] = useState<number | null>(null);
  // 낙관 전송용 — 내 표시 필드(닉/아바타/길드)는 서버 응답·최근 목록의 내 메시지에서 채움.
  const myFieldsRef = useRef<ChatMessageDto | null>(null);
  const tempSeqRef = useRef(0);
  // 패널 오픈 직후 첫 렌더를 페인트 전에 바닥으로 — 위가 보였다가 내려가는 깜빡임 방지.
  const needInitialScrollRef = useRef(false);
  // onScroll rAF 스로틀 — scrollHeight 읽기는 강제 리플로우라 프레임당 1회로 제한.
  const scrollRafRef = useRef(0);
  openRef.current = open;
  // 폴링 타이머(장수명 클로저)가 읽는 미러 refs — 렌더 중 대입 대신 effect로 동기화(lint-clean).
  useEffect(() => {
    collapsedRef.current = collapsed;
    messagesRef.current = messages;
    meRef.current = me;
  }, [collapsed, messages, me]);

  // 튜토리얼 중엔 도크 숨김 — 코치마크·완료 모달과 시각 경합 방지. 접힘 상태도 초기 복원.
  // useLayoutEffect — useEffect는 페인트 뒤라 접어둔 유저에게 매 이동마다 펼침→접힘이
  // 한 프레임 보였다(채팅 패널 복원 깜빡임과 동일 계열, 2026-07-22).
  useLayoutEffect(() => {
    try {
      setHiddenByTutorial(Boolean(localStorage.getItem('tut_step')));
    } catch {
      /* ignore */
    }
    try {
      setCollapsed(localStorage.getItem(COLLAPSE_KEY) === '1');
    } catch {
      /* ignore */
    }
  }, []);

  const toggleCollapsed = () => {
    setCollapsedUnseen(false);
    setCollapsed((c) => {
      const next = !c;
      try {
        if (next) localStorage.setItem(COLLAPSE_KEY, '1');
        else localStorage.removeItem(COLLAPSE_KEY);
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  // 라우트 이동 → 패널 자동 최소화(2026-07-20 피드백 6). 마운트 첫 실행은 스킵 —
  // 아래 RESTORE_KEY 복원(뒤로가기)이 연 패널을 닫지 않도록.
  // useLayoutEffect — 새 페이지 커밋과 같은 페인트에 닫아 "새 페이지 위에 패널 1프레임"도 제거.
  const routeEffectRanRef = useRef(false);
  useLayoutEffect(() => {
    if (!routeEffectRanRef.current) {
      routeEffectRanRef.current = true;
      return;
    }
    setOpen(false);
    setProfile(null);
    setReportTarget(null);
    setShowBlockList(false);
  }, [pathname]);

  const visible = enabled === true && !hiddenByTutorial;

  // 미니바 높이 발행 — 레이아웃 main의 paddingBottom이 이 변수로 비켜섬.
  useEffect(() => {
    const root = document.documentElement;
    if (visible) root.style.setProperty('--chat-dock-h', DOCK_H);
    else root.style.removeProperty('--chat-dock-h');
    return () => {
      root.style.removeProperty('--chat-dock-h');
    };
  }, [visible]);

  // 접힘 중 새 메시지 감지 — 최초 로드(prev null)는 제외, 차단 유저 메시지도 제외.
  const prevLatestIdRef = useRef<string | null>(null);
  useEffect(() => {
    const id = latest && !blocked.has(latest.userId) ? latest.id : null;
    // !open — 푸시 딥링크 등으로 접힌 채 패널이 열린 경우, 보고 있는 메시지에 배지 점등 방지.
    if (id && prevLatestIdRef.current && id !== prevLatestIdRef.current && collapsed && !open) {
      setCollapsedUnseen(true);
    }
    if (id) prevLatestIdRef.current = id;
  }, [latest, collapsed, blocked, open]);

  const scrollToBottom = useCallback((smooth = false) => {
    const el = listRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
  }, []);

  const applyNew = useCallback(
    (m: ChatMessageDto) => {
      if (!m.sys && !m.sysGuild) setLatest(m); // 시스템 라인은 미니바(마지막 채팅)에서 제외.
      // 닫힘 중에도 목록 버퍼를 채움 — 패널을 열 때 과거 목록이 먼저 보였다가 교체되는
      // 플래시 없이 즉시 현재 대화가 보이게(2026-07-21 피드백). 열림 시 fetch(100)가 정합 보정.
      setMessages((prev) => {
        if (prev.some((p) => p.id === m.id)) return prev;
        // 내 broadcast가 전송 응답보다 먼저 도착하는 창 — 같은 본문의 temp를 즉시 대체해
        // "내 메시지가 잠깐 2개" 현상 제거(감사 버그). 응답 측은 이미 실메시지 존재 시 temp만 지움.
        let base = prev;
        if (meRef.current && m.userId === meRef.current) {
          const ti = prev.findIndex((p) => p.id.startsWith('tmp-') && p.body === m.body);
          if (ti >= 0) base = prev.filter((_, idx) => idx !== ti);
        }
        const next = [...base, m];
        return next.length > 150 ? next.slice(-150) : next;
      });
      if (openRef.current) {
        // 바닥 근처에서만 자동 스크롤(위로 읽는 중이면 유지 + "↓ 새 메시지" 칩).
        const el = listRef.current;
        if (el && el.scrollHeight - el.scrollTop - el.clientHeight < 120) {
          requestAnimationFrame(() => scrollToBottom(true));
        } else {
          setUnseenBelow(true);
        }
      }
    },
    [scrollToBottom],
  );

  // iOS 키보드 겹침 보정 — 레이아웃 뷰포트는 안 줄고 visualViewport만 줄어드는 환경(iOS)에서
  // 가려진 높이만큼 패널을 올린다. 레이아웃까지 같이 줄어드는 환경(Android)은 차이가 0이라 무해.
  useEffect(() => {
    if (!open) return;
    const vv = window.visualViewport;
    if (!vv) return;
    let prevKb = 0;
    const update = () => {
      const kb = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      setKbOffset(Math.round(kb));
      // 키보드가 '열리는 전이'에만 바닥 고정 — 열린 채 유지 중엔 스크롤을 뺏지 않는다
      // (visualViewport는 스크롤 중에도 발화해, 매번 바닥으로 끌면 위로 못 읽는다).
      if (kb > 0 && prevKb === 0) requestAnimationFrame(() => scrollToBottom());
      prevKb = kb;
    };
    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
      setKbOffset(0);
    };
  }, [open, scrollToBottom]);

  const fetchRecent = useCallback(
    // lite=닫힌 미니바 상시 폴링용 경량 조회(메시지만) — 서버가 차단목록·닉네임·길드 조회를
    // 생략하므로(DB 절감) 채널·차단 등 부속 상태는 초기/전체 조회 값을 유지한다.
    // after=증분 폴링(2026-08-06): 마지막으로 본 항목 id 이후만 델타로 받는다(평시 응답 0~3건).
    // 서버가 after를 못 찾으면 full로 응답 — 반환 mode로 구분해 append/치환을 가른다.
    async (
      limit: number,
      forTab?: Tab,
      lite?: boolean,
      after?: string | null,
    ): Promise<{ mode: 'full' | 'delta'; messages: ChatMessageDto[] } | null> => {
      const t = forTab ?? tabRef.current;
      try {
        const res = await fetch(
          `/api/chat/recent?limit=${limit}&channel=${t}${lite ? '&lite=1' : ''}${
            after ? `&after=${encodeURIComponent(after)}` : ''
          }`,
          { cache: 'no-store' },
        );
        if (!res.ok) return null;
        const data = (await res.json()) as {
          disabled?: boolean;
          channel?: string;
          me?: string;
          mode?: 'full' | 'delta';
          messages: ChatMessageDto[];
          meNickname?: string | null;
          guild?: { id: string; name: string } | null;
          guildChannel?: string | null;
          blocked?: { id: string; nickname: string }[];
        };
        if (data.disabled) {
          setEnabled(false);
          return null;
        }
        setEnabled(true);
        // 응답이 도착한 시점의 활성 탭과 요청 탭이 다르면(빠른 전환) 채널·목록 반영 스킵.
        if (t !== tabRef.current) return null;
        if (data.channel) {
          setChannel(data.channel);
          const sidNum = Number(data.channel.split(':s')[1]);
          if (Number.isInteger(sidNum)) {
            serverIdRef.current = sidNum;
            setSid(sidNum);
          }
        }
        if (data.me) setMe(data.me);
        if (data.meNickname) setMeNickname(data.meNickname);
        // lite 응답엔 guild/guildChannel/blocked가 아예 없음 — 기존 상태 유지(null 덮어쓰기 금지).
        // 값이 같으면 이전 참조/상태 유지 — 15초마다 "변화 없어도 전체 리렌더"를 막는다.
        if (!lite) {
          setMyGuild((prev) =>
            prev?.id === data.guild?.id && prev?.name === data.guild?.name
              ? prev
              : (data.guild ?? null),
          );
          setGuildTopic(data.guildChannel ?? null);
        }
        if (data.blocked) {
          const next = new Map(data.blocked.map((b) => [b.id, b.nickname]));
          setBlocked((prev) =>
            prev.size === next.size && [...next].every(([k, v]) => prev.get(k) === v)
              ? prev
              : next,
          );
        }
        const mine = data.messages.filter((m) => m.userId === data.me).pop();
        if (mine) myFieldsRef.current = mine;
        return { mode: data.mode ?? 'full', messages: data.messages };
      } catch {
        return null;
      }
    },
    [],
  );

  // 초기 로드 — 최근 1개(미니바).
  useEffect(() => {
    void fetchRecent(1).then((r) => {
      const lastUser = r ? [...r.messages].reverse().find((m) => !m.sys && !m.sysGuild) : null;
      if (lastUser) setLatest(lastUser);
    });
  }, [fetchRecent]);

  // 수신 라우팅 — 활성 탭이면 화면(applyNew), 비활성 탭이면 버퍼에만 적재(전환 즉시 표시).
  const routeIncoming = useCallback(
    (t: Tab, m: ChatMessageDto) => {
      if (t === tabRef.current) {
        applyNew(m);
        return;
      }
      const b = bufRef.current[t];
      if (!b.messages.some((x) => x.id === m.id)) {
        b.messages = [...b.messages, m].slice(-150);
      }
      if (!m.sys && !m.sysGuild) b.latest = m;
    },
    [applyNew],
  );

  // 서버 전환(sid 변경) 감지 — 버퍼·미니바 초기화. 구독 여부와 무관하게 실행되어야 해서
  // 구독 effect와 분리(닫힌 채 서버를 옮겨도 옛 서버 메시지가 남지 않도록).
  const prevSidRef = useRef<number | null>(null);
  useEffect(() => {
    if (sid === null) return;
    if (prevSidRef.current !== null && prevSidRef.current !== sid) {
      setMessages([]);
      setLatest(null);
      myFieldsRef.current = null;
      bufRef.current = { all: { messages: [], latest: null }, guild: { messages: [], latest: null } };
    }
    prevSidRef.current = sid;
  }, [sid]);

  // Realtime 구독 — **패널이 열린 동안만**(2026-08-06, 동접 1천 대비). 닫힌 유저까지 상시
  // 구독하면 동시 연결이 접속자 수만큼 쌓이고(Pro 한도 500), broadcast 1건이 전원에게
  // fan-out되어 메시지 쿼터를 태운다. 닫힘 미니바는 코얼레싱 미니 토픽(아래 effect)+60초
  // 폴링 안전망이 담당.
  // 열림 중엔 전체+내 길드 두 채널 동시 구독(탭 전환 시 재구독 없음 → 전환 즉시).
  useEffect(() => {
    if (enabled !== true || sid === null || !open) return;
    const sb = supabaseBrowser();
    if (!sb) return;
    const mk = (topic: string, t: Tab) =>
      sb
        .channel(topic)
        .on('broadcast', { event: 'new' }, ({ payload }) => routeIncoming(t, payload as ChatMessageDto))
        .on('broadcast', { event: 'sys' }, ({ payload }) => routeIncoming(t, sysToMsg(payload as WorldEventEntry)))
        .on('broadcast', { event: 'hide' }, ({ payload }) => {
          const id = (payload as { id: string }).id;
          setMessages((prev) => prev.filter((m) => m.id !== id));
          setLatest((prev) => (prev?.id === id ? null : prev));
          for (const b of Object.values(bufRef.current)) {
            b.messages = b.messages.filter((m) => m.id !== id);
            if (b.latest?.id === id) b.latest = null;
          }
        })
        .subscribe();
    const chans = [mk(`chat:s${sid}`, 'all')];
    // 길드 토픽은 서버가 소속 검증 후 내려준 값만 사용(HMAC 토큰 포함 — 클라 조립 금지).
    if (guildTopic) chans.push(mk(guildTopic, 'guild'));
    return () => {
      for (const c of chans) void sb.removeChannel(c);
    };
  }, [enabled, sid, guildTopic, open, routeIncoming]);

  // 미니바 준실시간(2026-08-06 확정) — **닫힘(비접힘) 동안만** 코얼레싱 미니 토픽 구독.
  // 서버가 15초당 최대 1건(월드 최신 메시지)만 발사해 fan-out 비용 상한 고정 — 한산할 때의
  // 첫 메시지는 스로틀을 즉시 통과하므로 체감상 실시간. 60초 lite 폴링은 유실(스로틀로 묶인
  // 건·hide·WS 사망) 보정 안전망으로 유지. 토픽 문자열은 서버 chatMiniTopic과 동기.
  useEffect(() => {
    // enabled 가드 — 킬스위치(채팅 OFF)가 내려가면 미니 연결도 함께 끊는다(리뷰 지적:
    // Realtime 과부하 시 킬스위치로 연결을 떨어뜨리는 시나리오의 반쪽 방지).
    if (enabled !== true || sid === null || open || collapsed) return;
    const sb = supabaseBrowser();
    if (!sb) return;
    const ch = sb
      .channel(`chat-mini:s${sid}`)
      .on('broadcast', { event: 'new' }, ({ payload }) =>
        routeIncoming('all', payload as ChatMessageDto),
      )
      .subscribe();
    return () => {
      void sb.removeChannel(ch);
    };
  }, [enabled, sid, open, collapsed, routeIncoming]);

  // 길드 탈퇴/해산 감지 — 길드 버퍼·미니바 잔존 제거.
  useEffect(() => {
    if (myGuild) return;
    bufRef.current.guild = { messages: [], latest: null };
    if (tabRef.current === 'guild') setLatest(null);
  }, [myGuild]);

  // 비활성 탭 선적재 — 길드 소속이 확인되면 길드 버퍼를 미리 채워 첫 전환도 즉시.
  useEffect(() => {
    if (!myGuild || bufRef.current.guild.messages.length > 0) return;
    void fetch('/api/chat/recent?limit=50&channel=guild&lite=1', { cache: 'no-store' })
      .then(async (r) => (r.ok ? ((await r.json()) as { messages?: ChatMessageDto[] }) : null))
      .then((d) => {
        if (!d?.messages || tabRef.current === 'guild') return;
        const lastUser = [...d.messages].reverse().find((m) => !m.sys && !m.sysGuild) ?? null;
        bufRef.current.guild = { messages: d.messages, latest: lastUser };
      })
      .catch(() => {
        /* 무시 — 전환 시 재조회 */
      });
  }, [myGuild?.id]);

  // 폴링 — Realtime(WS) 백업 + 닫힘 미니바의 유일한 수신 경로(2026-08-06: WS는 열림 시에만).
  // 열림=100(after 증분 — 평시 델타 0~3건), 닫힘=1(lite: 1건·부속 조회 생략).
  // 비용 최소화: ① 백그라운드 탭이면 이번 주기 스킵(다시 보일 때 즉시 따라잡기)
  //   ② 주기는 열림 15초 / 닫힘 60초 / 접힘 180초. WS 상태는 주기에 반영하지 않는다 —
  //   과거엔 WS 끊김 시 전원이 15초로 가속했는데, 그게 Realtime 장애를 DB 폭주로 번지게
  //   하는 캐스케이드였다(감사 #3). refs라 주기는 매 tick 최신값으로 재평가된다.
  useEffect(() => {
    if (enabled === false) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;
    let lastPollAt = 0;
    const poll = () => {
      lastPollAt = Date.now();
      // 요청 시점의 열림 상태로 처리 분기 — 응답 도착 사이에 열림/닫힘이 바뀌면(레이스)
      // 닫힘용 1건 응답이 열린 목록을 통째로 덮던 버그(감사 버그 #1)의 수정.
      const wasOpen = openRef.current;
      const after = wasOpen
        ? ([...messagesRef.current].reverse().find((m) => !m.id.startsWith('tmp-'))?.id ?? null)
        : null;
      // 폴링은 열림/닫힘 모두 lite — 차단목록·닉네임·토픽 부속 쿼리는 열기/탭 전환의
      // 전체 조회가 담당(값이 바뀌는 이벤트가 그때뿐). 월드 lite+캐시 히트 = DB 0쿼리.
      void fetchRecent(wasOpen ? 100 : 1, undefined, true, after).then((r) => {
        if (!r) return;
        const ms = r.messages;
        if (wasOpen) {
          if (!openRef.current) return; // 닫힌 뒤 도착한 열림용 응답 — 폐기(다음 열림 fetch가 정합)
          if (r.mode === 'delta') {
            // 증분 — 기존 목록 유지 + 새 항목만 append(WS로 먼저 받은 건 중복 제거).
            // 치환이 아니라서 WS 수신분이 폴링에 지워지는 문제(감사 버그)도 함께 사라진다.
            if (ms.length > 0) {
              setMessages((prev) => {
                const add = ms.filter((m) => !prev.some((p) => p.id === m.id));
                if (add.length === 0) return prev;
                const next = [...prev, ...add];
                return next.length > 150 ? next.slice(-150) : next;
              });
              const el = listRef.current;
              if (el && el.scrollHeight - el.scrollTop - el.clientHeight < 120)
                requestAnimationFrame(() => scrollToBottom(true));
              else setUnseenBelow(true);
            }
          } else {
            setMessages((prev) => [...ms, ...prev.filter((m) => m.id.startsWith('tmp-'))]);
          }
        } else if (ms.length > 0) applyNew(ms[ms.length - 1]!);
        const lastUser = [...ms].reverse().find((m) => !m.sys && !m.sysGuild);
        if (lastUser) setLatest(lastUser);
      });
    };
    const schedule = () => {
      if (stopped) return;
      const delay = openRef.current ? 15000 : collapsedRef.current ? 180000 : 60000;
      timer = setTimeout(() => {
        if (!document.hidden) poll(); // 백그라운드 탭은 스킵 — visibilitychange가 복귀 시 따라잡음
        schedule();
      }, delay);
    };
    schedule();
    const onVisible = () => {
      // 포그라운드 복귀 따라잡기 — 5초 디바운스: 앱 전환을 빠르게 오가는 유저가
      // 복귀마다 즉시 폴링을 쏘면 아침 복귀 시간대에 순간 폭주(감사 시나리오 F).
      if (!document.hidden && Date.now() - lastPollAt > 5_000) poll();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [enabled, fetchRecent, applyNew, scrollToBottom]);

  // 쿨다운 카운트다운.
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  // 멘션 자동완성 — 입력 끝 @접두를 서버 전체 닉네임에서 prefix 검색(250ms 디바운스).
  useEffect(() => {
    const tok = /@([^\s@]{1,12})$/.exec(input);
    if (!tok) {
      setSearchCands([]);
      return;
    }
    const q = tok[1]!;
    const t = setTimeout(() => {
      void fetch(`/api/chat/mention-search?q=${encodeURIComponent(q)}`, { cache: 'no-store' })
        .then(async (r) => (r.ok ? ((await r.json()) as { nicknames: string[] }) : null))
        .then((d) => setSearchCands(d?.nicknames ?? []))
        .catch(() => setSearchCands([]));
    }, 250);
    return () => clearTimeout(t);
  }, [input]);

  const openPanel = () => {
    setOpen(true);
    setUnseenBelow(false);
    needInitialScrollRef.current = true;
    void fetchRecent(100).then((r) => {
      if (r) {
        // fetch 반영 렌더도 페인트 전 바닥 고정 — 단, 응답이 오는 사이 유저가 위로 스크롤해
        // 읽는 중이면 위치를 뺏지 않는다(감사 버그: 늦은 응답의 스크롤 강탈).
        const el = listRef.current;
        if (!el || el.scrollHeight - el.scrollTop - el.clientHeight < 120)
          needInitialScrollRef.current = true;
        setMessages((prev) => [...r.messages, ...prev.filter((m) => m.id.startsWith('tmp-'))]);
      }
    });
  };

  // 탭 전환(전체/길드) — 캐시 버퍼를 즉시 표시(렉 없음), 백그라운드 재조회로 정합 보정.
  // 구독은 두 채널 상시 유지라 재구독 비용도 없음.
  const switchTab = (next: Tab, limitOverride?: number) => {
    if (next === tab) return;
    // 현재 탭 상태를 버퍼로 저장 후 다음 탭 버퍼를 즉시 로드.
    bufRef.current[tab] = { messages, latest };
    const cached = bufRef.current[next];
    setTab(next);
    tabRef.current = next;
    setMessages(cached.messages);
    // 탭 전환에 의한 latest 교체는 '새 메시지'가 아님 — 접힘 점 배지 오탐 방지.
    prevLatestIdRef.current = cached.latest && !blocked.has(cached.latest.userId) ? cached.latest.id : null;
    setLatest(cached.latest);
    setUnseenBelow(false);
    needInitialScrollRef.current = true;
    void fetchRecent(limitOverride ?? (open ? 100 : 1), next).then((r) => {
      if (!r) return;
      // 탭 전환 응답 — 그 사이 위로 스크롤해 읽는 중이면 바닥 고정을 생략(스크롤 강탈 방지).
      const el = listRef.current;
      if (!el || el.scrollHeight - el.scrollTop - el.clientHeight < 120)
        needInitialScrollRef.current = true;
      setMessages((prev) => [...r.messages, ...prev.filter((m) => m.id.startsWith('tmp-'))]);
      const lastUser = [...r.messages].reverse().find((m) => !m.sys && !m.sysGuild);
      if (lastUser) setLatest(lastUser);
    });
  };

  // 푸시 클릭 목적지(?chat=all|guild) — 채팅창을 해당 탭으로 오픈. 처리 후 쿼리 제거.
  const openFromPushRef = useRef<(url: string) => void>(() => {});
  openFromPushRef.current = (url: string) => {
    let chat: string | null = null;
    try {
      chat = new URL(url, location.origin).searchParams.get('chat');
    } catch {
      return;
    }
    if (chat !== 'all' && chat !== 'guild') return;
    if (chat !== tabRef.current) switchTab(chat, 100);
    openPanel();
    try {
      const u = new URL(location.href);
      if (u.searchParams.has('chat')) {
        u.searchParams.delete('chat');
        history.replaceState(null, '', u.pathname + (u.search ? u.search : ''));
      }
    } catch {
      /* ignore */
    }
  };
  // GNB 탭 → 패널 최소화. **같은 경로 재탭만** 즉시 닫는다(내비게이션 없음 = pathname
  // effect가 못 닫는 케이스). 실제 이동은 pathname 전환 layout effect가 새 페이지 페인트와
  // 동시에 닫음 — 먼저 닫으면 옛 페이지가 내비 지연 동안 그대로 보여 어지러웠다(2026-07-22).
  useEffect(() => {
    const onGnb = (e: Event) => {
      const target = (e as CustomEvent<string>).detail;
      const here = location.pathname;
      const same = target === '/' ? here === '/' : here === target || here.startsWith(`${target}/`);
      if (same) setOpen(false);
    };
    window.addEventListener('ig:gnb-nav', onGnb);
    return () => window.removeEventListener('ig:gnb-nav', onGnb);
  }, []);

  useEffect(() => {
    // 콜드 오픈(알림 → 새 창/전체 내비게이션) — 첫 마운트의 주소로 판정.
    if (location.search.includes('chat=')) openFromPushRef.current(location.href);
    // 앱이 이미 열려 있을 때 — PushAutoSync가 발행하는 목적지 이벤트 수신.
    const onNav = (e: Event) => {
      const url = (e as CustomEvent<string>).detail;
      if (typeof url === 'string') openFromPushRef.current(url);
    };
    window.addEventListener('ig:push-nav', onNav);
    return () => window.removeEventListener('ig:push-nav', onNav);
  }, []);

  // 대표 칭호 낙관 반영(2026-08-05) — 칭호 화면 장착/해제 시 폴링을 기다리지 않고
  // 목록에 이미 올라온 내 메시지들의 칭호를 즉시 교체. null=미표시(자동 폴백 없음).
  useEffect(() => {
    if (!me) return;
    const onRep = (e: Event) => {
      const code = (e as CustomEvent<string | null>).detail;
      const patch = (m: ChatMessageDto): ChatMessageDto =>
        m.userId === me ? { ...m, repTitle: code } : m;
      setMessages((prev) => prev.map(patch));
      setLatest((prev) => (prev ? patch(prev) : prev));
      if (myFieldsRef.current) myFieldsRef.current = patch(myFieldsRef.current);
    };
    window.addEventListener('ig:reptitle', onRep);
    return () => window.removeEventListener('ig:reptitle', onRep);
  }, [me]);

  // 페인트 전 바닥 스크롤 — openPanel 직후 렌더(이전 목록)와 fetch 반영 렌더 모두.
  useLayoutEffect(() => {
    if (!open || !needInitialScrollRef.current || messages.length === 0) return;
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
    needInitialScrollRef.current = false;
  }, [open, messages]);

  // '프로필 보기'로 나갔다 돌아온 마운트 — 채팅 패널 + 유저 팝업을 저장분으로 즉시 복원,
  // 이후 백그라운드 재조회로 최신화(1회 소비). useLayoutEffect — useEffect는 페인트 뒤라
  // 닫힌 FAB가 한 프레임 그려진 후 열려 깜빡였다(2026-07-22 피드백). 페인트 전 복원으로 제거.
  useLayoutEffect(() => {
    try {
      const raw = sessionStorage.getItem(RESTORE_KEY);
      if (!raw) return;
      sessionStorage.removeItem(RESTORE_KEY);
      if (raw === 'panel') {
        openPanel(); // 시스템 라인 닉네임 링크 복귀 — 패널만 복원.
        return;
      }
      const data = JSON.parse(raw) as MiniProfile;
      openPanel();
      setProfile({ userId: data.userId, data });
      openProfile(data.userId);
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const errorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flashError = (msg: string) => {
    setError(msg);
    if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
    errorTimerRef.current = setTimeout(() => setError(null), 3000);
  };
  useEffect(() => () => {
    if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
  }, []);

  // 낙관 전송(2026-07-20 피드백) — 즉시 내 말풍선을 띄우고 서버 확정 시 실 메시지로 교체.
  // 실패하면 말풍선 회수 + 입력 복원 + 쿨다운 해제. (타 유저 수신 순서와 잠시 다를 수 있음 — 허용.)
  const submit = () => {
    const body = input.trim();
    if (!body || sending || cooldown > 0) return;
    setSending(true);
    const tempId = `tmp-${++tempSeqRef.current}`;
    const mine = myFieldsRef.current;
    const temp: ChatMessageDto = {
      id: tempId,
      userId: me ?? 'me',
      nickname: mine?.nickname ?? '나',
      publicCode: mine?.publicCode ?? null,
      avatar: mine?.avatar ?? null,
      faceBox: mine?.faceBox ?? null,
      guildName: mine?.guildName ?? null,
      guildEmblemUrl: mine?.guildEmblemUrl ?? null,
      executorZone: mine?.executorZone ?? null,
      executorZoneRegion: mine?.executorZoneRegion ?? null,
      repTitle: mine?.repTitle ?? null,
      isMeleeChampion: mine?.isMeleeChampion ?? false,
      mentions: null,
      body,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, temp]);
    setInput('');
    setCooldown(COOLDOWN_S);
    // 재포커스(2026-08-07 제보) — 한글 IME 조합 중 전송하면 setInput('')이 조합 세션을 깨며
    // 간헐적으로 입력창이 blur돼 키보드가 닫혔다. 제스처 콜스택 안의 focus()는 iOS에서도
    // 키보드를 유지시킨다(이미 포커스면 no-op). 연속 전송 UX의 핵심.
    inputRef.current?.focus();
    requestAnimationFrame(() => scrollToBottom(true));
    // 응답 도착 전에 탭을 바꿀 수 있음 — 확정/롤백은 '전송한 탭'에만 반영(활성이면 상태, 아니면 버퍼).
    const sentTab = tabRef.current;
    const rollback = () => {
      if (sentTab === tabRef.current) {
        setMessages((prev) => prev.filter((m) => m.id !== tempId));
        setInput(body);
        setCooldown(0);
      } else {
        const b = bufRef.current[sentTab];
        b.messages = b.messages.filter((m) => m.id !== tempId);
        // 탭을 바꾼 뒤 실패 — 입력 문장을 버리지 않되, 새로 치는 중이면 덮지 않는다(감사 버그).
        setInput((cur) => cur || body);
        setCooldown(0);
      }
    };
    // 전송은 서버 액션 대신 라우트(2026-08-06) — 액션은 응답에 layout 재렌더(RSC)가 동봉되어
    // 최고 빈도 쓰기에 부적합했다. 채팅 UI는 낙관 렌더가 담당하므로 순수 JSON이면 충분.
    void fetch('/api/chat/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body, channel: sentTab }),
      cache: 'no-store',
    })
      .then(async (res) => (await res.json()) as SendChatResult)
      .then((r) => {
        if (r.status === 'error') {
          rollback();
          flashError(r.message);
          return;
        }
        myFieldsRef.current = r.message;
        if (sentTab === tabRef.current) {
          setLatest(r.message);
          setMessages((prev) => {
            const rest = prev.filter((m) => m.id !== tempId);
            // 내 broadcast가 먼저 도착해 이미 실 메시지가 있으면 temp만 제거.
            return rest.some((m) => m.id === r.message.id) ? rest : [...rest, r.message];
          });
        } else {
          const b = bufRef.current[sentTab];
          const rest = b.messages.filter((m) => m.id !== tempId);
          b.messages = rest.some((m) => m.id === r.message.id) ? rest : [...rest, r.message];
          b.latest = r.message;
        }
      })
      .catch(() => {
        rollback();
        flashError('전송에 실패했어요. 다시 시도해 주세요.');
      })
      .finally(() => setSending(false));
  };

  // 로딩 팝업 없이 — 데이터가 다 오면 그때 연다(2026-07-21 피드백 3).
  // useCallback — ChatRow(memo) prop으로 내려가므로 참조가 흔들리면 memo가 무효.
  const openProfile = useCallback((userId: string) => {
    setPopupFlash(null);
    void fetch(`/api/chat/profile?uid=${userId}`, { cache: 'no-store' })
      .then(async (res) => (res.ok ? ((await res.json()) as MiniProfile) : null))
      .then((data) => {
        if (data) setProfile({ userId, data });
      })
      .catch(() => {
        /* 무시 — 팝업 미노출 */
      });
  }, []);
  const onReport = useCallback((m: ChatMessageDto) => setReportTarget(m), []);

  // 차단 토글(0126, 서버 저장) — 낙관 반영 후 서버 확정, 실패 시 복원.
  const toggleBlock = (userId: string, nickname: string) => {
    const wasBlocked = blocked.has(userId);
    setBlocked((prev) => {
      const next = new Map(prev);
      if (wasBlocked) next.delete(userId);
      else next.set(userId, nickname);
      return next;
    });
    void setChatBlockAction(userId, !wasBlocked).then((r) => {
      if (r.status === 'error') {
        setBlocked((prev) => {
          const next = new Map(prev);
          if (wasBlocked) next.set(userId, nickname);
          else next.delete(userId);
          return next;
        });
        setPopupFlash(r.message ?? '요청에 실패했어요');
      }
    });
  };

  // 멘션 자동완성 — 입력 끝의 @접두에 대해 최근 발언자 닉 후보(최대 5).
  const mentionToken = /@([^\s@]{0,12})$/.exec(input);
  const mentionCands = mentionToken
    ? [
        ...new Set([
          // 최근 발언자(즉시) 우선, 서버 전체 검색(디바운스) 결과로 보강.
          ...[...messages]
            .reverse()
            .filter((m) => !m.sys && m.userId && m.userId !== me)
            .map((m) => m.nickname)
            .filter((n) => n.startsWith(mentionToken[1] ?? '')),
          ...searchCands,
        ]),
      ].slice(0, 5)
    : [];
  const applyMention = (nick: string) => {
    if (!mentionToken) return;
    setInput(input.slice(0, mentionToken.index) + '@' + nick + ' ');
  };

  const confirmReport = () => {
    const m = reportTarget;
    if (!m) return;
    setReportTarget(null);
    void reportChat(m.id).then((r) => {
      flashError(
        r.status === 'ok' ? '신고가 접수되었습니다.' : (r.message ?? '신고에 실패했습니다.'),
      );
    });
  };

  if (!visible) return null;

  const visibleMessages = messages.filter((m) => !blocked.has(m.userId));
  const visibleLatest = latest && !blocked.has(latest.userId) ? latest : null;

  return (
    <>
      {/* 미니바 — GNB(+가이드 티커) 바로 위 fixed, 반투명(뒤 콘텐츠 비침) */}
      {!open ? (
        <div
          className="pointer-events-none fixed inset-x-0 z-20"
          style={{ bottom: 'calc(3.5rem + env(safe-area-inset-bottom) + var(--gt-h, 0px))' }}
        >
          <div className="mx-auto w-full max-w-[390px] px-2 pb-2">
            {collapsed ? (
              // 접힘(채팅 안 보기) — 왼쪽에 이모지만, 탭하면 다시 펼침.
              <button
                type="button"
                onClick={toggleCollapsed}
                aria-label="채팅 펼치기"
                className="pointer-events-auto relative flex h-[34px] w-[34px] items-center justify-center rounded-full border border-zinc-200/70 bg-white/70 backdrop-blur-md dark:border-zinc-700/60 dark:bg-zinc-900/70"
              >
                <span aria-hidden className="text-[12px]">
                  💬
                </span>
                {collapsedUnseen ? (
                  <span
                    aria-hidden
                    className="absolute top-0 right-0 h-2 w-2 rounded-full bg-amber-500 ring-2 ring-white dark:ring-zinc-900"
                  />
                ) : null}
              </button>
            ) : (
              <div className="pointer-events-auto flex h-[34px] w-full items-center rounded-full border border-zinc-200/70 bg-white/70 pr-3 pl-1.5 backdrop-blur-md dark:border-zinc-700/60 dark:bg-zinc-900/70">
                <button
                  type="button"
                  onClick={toggleCollapsed}
                  aria-label="채팅 접기"
                  className="flex h-full shrink-0 items-center px-1.5 text-[12px]"
                >
                  <span aria-hidden>💬</span>
                </button>
                <button
                  type="button"
                  onClick={openPanel}
                  aria-label="전체 채팅 열기"
                  className="flex h-full min-w-0 flex-1 items-center text-left"
                >
                  {visibleLatest ? (
                    // key=메시지 id — 최신 메시지 교체 시 리마운트로 fade 재생.
                    <span
                      key={visibleLatest.id}
                      className="animate-chat-swap min-w-0 flex-1 truncate text-[11px] text-zinc-500 dark:text-zinc-400"
                    >
                      <b className="font-semibold text-zinc-700 dark:text-zinc-200">
                        {visibleLatest.isMeleeChampion ? '🏆' : ''}
                        {visibleLatest.nickname}
                      </b>
                      <span className="mx-1 opacity-60">·</span>
                      {visibleLatest.body}
                    </span>
                  ) : (
                    <span className="flex-1 truncate text-[11px] text-zinc-400">
                      {tab === 'guild' ? '길드 채팅' : '전체 채팅'}
                    </span>
                  )}
                </button>
              </div>
            )}
          </div>
        </div>
      ) : null}

      {/* 전체 패널 — 헤더·GNB 사이를 덮는 불투명 오버레이 */}
      {open ? (
        <div
          className="fixed inset-x-0 z-20"
          style={{
            top: 'calc(3rem + env(safe-area-inset-top))',
            // 키보드가 열리면(kbOffset>0) GNB 오프셋 대신 키보드 위로 — max()로 큰 쪽 채택.
            bottom: `max(${kbOffset}px, calc(3.5rem + env(safe-area-inset-bottom) + var(--gt-h, 0px)))`,
          }}
        >
          <div className="relative mx-auto flex h-full w-full max-w-[390px] flex-col bg-white dark:bg-zinc-950">
            <header className="flex shrink-0 items-center justify-between gap-2 border-b border-zinc-100 px-3 py-1.5 dark:border-zinc-800/70">
              <div className="flex items-center gap-4">
                {(['all', 'guild'] as const).map((tk) => (
                  <button
                    key={tk}
                    type="button"
                    onClick={() => switchTab(tk)}
                    className={`relative py-1 text-[13px] transition-colors ${
                      tab === tk
                        ? 'font-bold text-zinc-900 dark:text-zinc-50'
                        : 'font-medium text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300'
                    }`}
                  >
                    {tk === 'all' ? '전체' : '길드'}
                    {tab === tk ? (
                      <span className="absolute -bottom-[7px] left-0 right-0 h-[2px] rounded-full bg-zinc-900 dark:bg-zinc-50" />
                    ) : null}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setShowBlockList(true)}
                className="shrink-0 text-[10.5px] font-semibold text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
              >
                차단 목록
              </button>
            </header>

            <div
              ref={listRef}
              onScroll={() => {
                if (scrollRafRef.current) return;
                scrollRafRef.current = requestAnimationFrame(() => {
                  scrollRafRef.current = 0;
                  const el = listRef.current;
                  if (el && el.scrollHeight - el.scrollTop - el.clientHeight < 120)
                    setUnseenBelow(false);
                });
              }}
              className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2.5 py-2"
            >
              {tab === 'guild' && !myGuild ? (
                <div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center">
                  <p className="text-[12.5px] leading-relaxed text-zinc-500 dark:text-zinc-400">
                    길드에 가입하면 길드원들과 대화할 수 있어요.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      try {
                        sessionStorage.setItem(RESTORE_KEY, 'panel');
                      } catch {
                        /* ignore */
                      }
                      router.push('/guild');
                    }}
                    className="rounded-full bg-amber-500 px-5 py-2 text-[12.5px] font-bold text-white"
                  >
                    길드 가입하기
                  </button>
                </div>
              ) : null}
              {(tab !== 'guild' || myGuild) &&
                visibleMessages.map((m, i) => (
                  <ChatRow
                    key={m.id}
                    m={m}
                    prevMsg={visibleMessages[i - 1]}
                    me={me}
                    meNickname={meNickname}
                    serverId={sid ?? 1}
                    onProfile={openProfile}
                    onReport={onReport}
                  />
                ))}
            </div>

            {unseenBelow ? (
              <button
                type="button"
                onClick={() => {
                  scrollToBottom(true);
                  setUnseenBelow(false);
                }}
                className="absolute bottom-[60px] left-1/2 z-10 -translate-x-1/2 rounded-full bg-zinc-800/90 px-3 py-1.5 text-[11px] font-bold text-white shadow-lg backdrop-blur-sm dark:bg-zinc-200/90 dark:text-zinc-900"
              >
                ↓ 새 메시지
              </button>
            ) : null}

            {tab === 'guild' && !myGuild ? null : (
            <div className="shrink-0 border-t border-zinc-100 px-2.5 py-2 dark:border-zinc-800/70">
              {error ? (
                <p className="mb-1 px-1 text-[11px] text-amber-600 dark:text-amber-400">{error}</p>
              ) : null}
              {mentionCands.length > 0 ? (
                <div className="mb-1 flex flex-wrap gap-1">
                  {mentionCands.map((n) => (
                    <button
                      key={n}
                      type="button"
                      onPointerDown={(e) => e.preventDefault()}
                      onClick={() => applyMention(n)}
                      className="rounded-full bg-zinc-100 px-2.5 py-1 text-[11px] font-semibold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
                    >
                      @{n}
                    </button>
                  ))}
                </div>
              ) : null}
              <div className="flex items-center gap-1.5">
                <ZoomSafeInput
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.nativeEvent.isComposing) submit();
                  }}
                  maxLength={100}
                  placeholder={tab === 'guild' ? '길드 채팅 · @닉네임 멘션' : '메시지 입력 · @닉네임 멘션'}
                  wrapClassName="h-9 min-w-0 flex-1"
                  className="rounded-full border border-zinc-200 bg-zinc-50 px-4 outline-none focus:border-amber-400 dark:border-zinc-700 dark:bg-zinc-900"
                />
                {input.length >= 80 ? (
                  <span className="shrink-0 text-[10px] text-zinc-400 tabular-nums">
                    {input.length}/100
                  </span>
                ) : null}
                <button
                  type="button"
                  onClick={submit}
                  // 포커스를 뺏지 않아 전송 후에도 키보드 유지(연속 대화). disabled 속성은
                  // pointerdown을 삼켜 비활성 탭에서 입력창 포커스가 풀림 — aria+스타일로 대체.
                  onPointerDown={(e) => e.preventDefault()}
                  aria-disabled={sending || cooldown > 0 || input.trim().length === 0}
                  className={`h-9 w-[54px] shrink-0 rounded-full bg-amber-500 text-[12.5px] font-bold text-white ${
                    sending || cooldown > 0 || input.trim().length === 0 ? 'opacity-40' : ''
                  }`}
                >
                  {cooldown > 0 ? `${cooldown}s` : '전송'}
                </button>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="채팅 닫기"
                  className="h-9 w-[54px] shrink-0 rounded-full bg-zinc-100 text-[12.5px] font-bold text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
                >
                  닫기
                </button>
              </div>
            </div>
            )}
          </div>
        </div>
      ) : null}

      {/* 미니 프로필 팝업 */}
      {profile ? (
        <ModalShell
          onClose={() => setProfile(null)}
          label="유저 정보"
          className="w-full max-w-[340px] overflow-hidden rounded-2xl bg-white dark:bg-zinc-900"
        >
          <div>
            {
              /* 자랑 카드식 2분할 — 왼쪽 전신 아바타(크게) / 오른쪽 정보+액션 */
              <div className="bg-gradient-to-br from-amber-50 via-white to-zinc-50 p-4 dark:from-amber-500/[0.09] dark:via-zinc-900 dark:to-zinc-900">
                {/* 닉네임·길드 — 프로필 페이지처럼 상단 가운데 별도 영역(닉 가림 방지) */}
                <div className="flex flex-col items-center text-center">
                  <b className="max-w-full truncate text-[15px] leading-tight">
                    {profile.data.isMeleeChampion ? '🏆 ' : ''}
                    {profile.data.nickname}
                  </b>
                  {profile.data.guildName || profile.data.repTitle ? (
                    <span className="mt-0.5 flex max-w-[88%] items-center justify-center gap-1 text-[11px] text-zinc-400">
                      {/* 순서 규칙(2026-07-23): 닉네임 → 길드문양 → 길드명 → 칭호(집행관 흡수). */}
                      {profile.data.guildEmblemUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={profile.data.guildEmblemUrl}
                          alt=""
                          className="h-3.5 w-3.5 shrink-0 object-contain"
                          style={{ imageRendering: 'pixelated' }}
                        />
                      ) : null}
                      {profile.data.guildName ? (
                        <span className="truncate">{profile.data.guildName}</span>
                      ) : null}
                      {profile.data.guildName && profile.data.repTitle ? (
                        <span className="shrink-0 text-zinc-600">·</span>
                      ) : null}
                      <TitleTag
                        code={profile.data.repTitle}
                        executorZone={profile.data.executorZone}
                        executorZoneRegion={profile.data.executorZoneRegion}
                      />
                    </span>
                  ) : null}
                </div>
                {/* 버튼 2개/4개와 무관하게 높이 고정 — 아바타 위치·크기 불변.
                    아바타는 object-cover로 세로를 꽉 채움(캔버스 좌우 여백은 크롭) */}
                <div className="mt-2 flex h-[184px] items-stretch gap-2.5">
                  {/* 크롭 없음 — 세로를 꽉 채우되 폭은 열 밖으로 넘쳐도 보이게(visible),
                      클립은 팝업 카드의 overflow-hidden(라운드)에서만 발생 */}
                  <div className="relative w-[150px] shrink-0">
                    {profile.data.avatar ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={profile.data.avatar}
                        alt=""
                        className="absolute bottom-0 left-1/2 h-full w-auto max-w-none -translate-x-1/2"
                        style={{ imageRendering: 'pixelated' }}
                      />
                    ) : (
                      <span className="flex h-full w-full items-center justify-center text-6xl">
                        👤
                      </span>
                    )}
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col">
                    <div className="space-y-1">
                      {(
                        [
                          ['전투력', profile.data.combat.toLocaleString()],
                          ['최고 강화', `+${profile.data.maxEnhance}`],
                          ['합산 강화', `+${profile.data.sumEnhance.toLocaleString()}`],
                          ['레이드 처치', profile.data.raidKills.toLocaleString()],
                          ['대난투', profile.data.meleeWins.toLocaleString()],
                        ] as const
                      ).map(([label, v]) => (
                        <div key={label} className="flex items-baseline justify-between gap-2">
                          <span className="text-[10px] text-zinc-400">{label}</span>
                          <span className="text-[12.5px] font-bold tabular-nums">{v}</span>
                        </div>
                      ))}
                    </div>
                    {popupFlash ? (
                      <p className="mt-1.5 text-[10.5px] text-amber-600 dark:text-amber-400">
                        {popupFlash}
                      </p>
                    ) : null}
                    {/* 액션 — isMe 여부와 무관하게 빈 칸 없이 채워지는 2열 */}
                    <div className="mt-auto grid grid-cols-2 gap-1.5 pt-3">
                      {!profile.data.isMe ? (
                        <>
                          <button
                            type="button"
                            disabled={profile.data.friendStatus !== null}
                            onClick={() => {
                              void sendRequestAction(profile.data!.userId).then((r) => {
                                setPopupFlash(
                                  r.status === 'success'
                                    ? '친구 요청을 보냈어요'
                                    : '요청에 실패했어요',
                                );
                                if (r.status === 'success')
                                  setProfile((prev) =>
                                    prev?.data
                                      ? { ...prev, data: { ...prev.data, friendStatus: 'pending' } }
                                      : prev,
                                  );
                              });
                            }}
                            className="rounded-lg bg-amber-500 py-1.5 text-[11.5px] font-bold text-white disabled:opacity-50"
                          >
                            {profile.data.friendStatus === 'accepted'
                              ? '친구 ✓'
                              : profile.data.friendStatus === 'pending'
                                ? '요청됨'
                                : '친구 추가'}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              toggleBlock(profile.data!.userId, profile.data!.nickname);
                              setPopupFlash(
                                blocked.has(profile.data!.userId)
                                  ? '차단을 해제했어요'
                                  : '이 기기에서 메시지를 숨겨요',
                              );
                            }}
                            className="rounded-lg bg-zinc-100 py-1.5 text-[11.5px] font-bold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
                          >
                            {blocked.has(profile.data.userId) ? '차단 해제' : '차단'}
                          </button>
                        </>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => {
                          if (!profile.data?.publicCode) return;
                          try {
                            // 뒤로가기 복원 — 프로필 데이터째 저장해 재조회 없이 즉시 복원.
                            sessionStorage.setItem(RESTORE_KEY, JSON.stringify(profile.data));
                          } catch {
                            /* ignore */
                          }
                          // 팝업을 닫지 않고 이동 — 페이지 전환과 함께 자연스럽게 사라짐.
                          router.push(`/u/${profile.data.publicCode}?s=${serverIdRef.current}`);
                        }}
                        className="rounded-lg bg-zinc-100 py-1.5 text-[11.5px] font-bold dark:bg-zinc-800"
                      >
                        프로필 보기
                      </button>
                      <button
                        type="button"
                        onClick={() => setProfile(null)}
                        className="rounded-lg bg-zinc-100 py-1.5 text-[11.5px] font-bold text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
                      >
                        닫기
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            }
          </div>
        </ModalShell>
      ) : null}

      {/* 차단 목록 팝업 — 차단 유저는 메시지가 숨어 프로필 진입이 불가하므로 여기서 해제 */}
      {showBlockList ? (
        <ModalShell onClose={() => setShowBlockList(false)} label="차단 목록">
          <ModalLayout
            title="차단 목록"
            subtitle={`${blocked.size}명`}
            maxBodyClass="max-h-[42vh]"
            footer={
              <ModalButton tone="ghost" onClick={() => setShowBlockList(false)}>
                닫기
              </ModalButton>
            }
          >
            {blocked.size === 0 ? (
              <p className="py-4 text-center text-[12px] text-zinc-400">차단한 유저가 없어요.</p>
            ) : (
              <ul className="space-y-1">
                {[...blocked].map(([id, nickname]) => (
                  <li
                    key={id}
                    className="flex items-center justify-between gap-2 rounded-lg bg-zinc-50 px-2.5 py-1.5 dark:bg-zinc-800/60"
                  >
                    <span className="truncate text-[12px] font-semibold">{nickname}</span>
                    <button
                      type="button"
                      onClick={() => toggleBlock(id, nickname)}
                      className="shrink-0 rounded-md bg-zinc-200 px-2 py-1 text-[11px] font-bold text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300"
                    >
                      해제
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </ModalLayout>
        </ModalShell>
      ) : null}

      {/* 신고 확인 팝업 */}
      {reportTarget ? (
        // 공용 셸로 — Esc·포커스 이동을 얻는다(2026-07-29 점검).
        <ModalShell
          onClose={() => setReportTarget(null)}
          onSubmit={confirmReport}
          label="메시지 신고"
        >
          <ModalLayout
            title="이 메시지를 신고할까요?"
            subtitle={
              <span className="font-bold text-zinc-600 dark:text-zinc-300">
                {reportTarget.nickname}
              </span>
            }
            footer={
              <>
                <ModalButton tone="ghost" onClick={() => setReportTarget(null)}>
                  취소
                </ModalButton>
                <ModalButton
                  tone="neutral"
                  onClick={() => {
                    const m = reportTarget;
                    if (!m) return;
                    toggleBlock(m.userId, m.nickname);
                    setReportTarget(null);
                    flashError('차단했어요. 차단 목록에서 해제할 수 있어요.');
                  }}
                >
                  차단
                </ModalButton>
                <ModalButton tone="danger" onClick={confirmReport}>
                  신고
                </ModalButton>
              </>
            }
          >
            <p className="rounded-lg bg-zinc-100 px-3 py-2 text-[12px] text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
              {reportTarget.body.slice(0, 60)}
            </p>
            <p className="mt-2 text-[10.5px] leading-relaxed text-zinc-400">
              신고가 누적되면 메시지가 자동으로 숨겨집니다.
            </p>
          </ModalLayout>
        </ModalShell>
      ) : null}
    </>
  );
}
