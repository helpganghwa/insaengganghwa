'use client';

import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ModalShell } from '@/components/ModalShell';
import { ModalLayout, ModalButton } from '@/components/ModalLayout';
import { usePathname, useRouter } from 'next/navigation';

import { supabaseBrowser } from '@/lib/supabase-browser';
import { ZoomSafeInput } from '@/components/ui/ZoomSafeField';
import { type FaceBox } from '@/components/faceCrop';
import { TitleTag } from '@/components/TitleTag';
import type { ChatMessageDto } from '@/lib/game/chat/service';
import type { WorldEventEntry } from '@/lib/game/world/event';
import { sendRequestAction } from '@/app/(game)/friends/actions';

import type { SendChatResult } from '@/lib/game/chat/send';

import { reportChat, setChatBlockAction } from './actions';
import { ChatDateDivider, ChatRow, chatDateLabel, RESTORE_KEY } from './ChatRow';
import {
  WhisperPane,
  type WhisperMessageDto,
  type WhisperOpenTarget,
  type WhisperThread,
  type WhisperThreadsRes,
} from './WhisperPane';

/**
 * 전체 채팅 도크(0125, 2026-07-20 확정 UX) —
 *  - GNB 바로 위 fixed 반투명 미니바(최근 1개 메시지) → 탭하면 헤더·GNB 사이를 덮는 불투명 패널
 *  - 탭 = 전체 / 길드 / 귓속말(1:1 — 본문은 WhisperPane, 이 파일은 열림·탭·구독만 관리)
 *  - 메시지 행은 세 탭 공용(components/chat/ChatRow.tsx)
 *  - 수신: Supabase Realtime broadcast 구독, 실패 시 15초 폴링 폴백
 *  - 닉네임/아바타 탭 → 미니 프로필 팝업(전투력·강화 / 귓속말·친구추가·차단 · 프로필·닫기)
 *  - 신고는 메시지 본문 탭 → 확인 팝업(유저 단위 신고 버튼 없음 — 대상이 모호해진다)
 *  - 차단은 로컬(기기) 필터 — localStorage 목록, 서버 부담 0
 *  - 미니바 높이는 --chat-dock-h로 발행(main 하단 패딩), --gt-h(가이드 티커) 합산 오프셋
 *  - 패널 위/아래 기준선은 --inst-h(설치 띠지)·--gt-h를 더해 계산 — 상단 고정물이 늘면 여기부터
 *  - 소프트 키보드가 열린 동안은 이 계산을 쓰지 않고 비주얼 뷰포트에 직접 고정(아래 effect)
 *  - 라우트 이동 시 패널 자동 최소화
 *
 * 외부 진입 이벤트(2026-08-07)
 *  - `ig:whisper-open` — CustomEvent<{ peerUserId: string }>. 도크가 전역(레이아웃)에 있어
 *    친구 목록 등 다른 화면에서 직접 조작할 수 없으므로, 이 이벤트로 "도크 열기 + 귓속말 탭 +
 *    해당 상대 스레드"를 요청한다. 발신처: app/(game)/friends/FriendsTabs.tsx.
 *  - 푸시 딥링크 `?chat=whisper&peer={publicCode}` — 기존 `?chat=all|guild`의 확장.
 */

const COOLDOWN_S = 5;
const DOCK_H = '42px';
const COLLAPSE_KEY = 'ig:chat-collapsed';
// 미니바 노티점 — 채널별로 "마지막으로 확인한 메시지 id". 서버 latestIds와 다르면 점을 켠다.
const SEEN_KEY = 'ig:chat-seen';
/**
 * 길드 채널 id 캐시({ sid, gid }) — lite 폴링이 길드 최신 id를 받으려면 gid가 필요한데,
 * lite 응답엔 소속 정보가 없다. 서버별로 저장해 새로고침 직후·닫힌 상태에서도 길드 점이 뜨게.
 * sid가 다르면(서버 이동) 즉시 버린다.
 */
const GID_KEY = 'ig:chat-gid';

/**
 * 패널 박스 — 키보드가 닫혀 있을 때의 위/아래 기준선.
 * top: 헤더(h-12) 아래. 설치 띠지(InstallStrip)는 헤더 **위 일반 흐름**이라 그 높이(--inst-h)만큼
 *      헤더가 내려가 있다 — 안 더하면 패널 탭 영역이 헤더(z-30) 뒤로 숨는다(2026-08-07).
 * bottom: GNB(h-14) + 가이드 티커 위.
 */
const PANEL_TOP = 'calc(3rem + var(--inst-h, 0px) + env(safe-area-inset-top))';
const PANEL_BOTTOM = 'calc(3.5rem + env(safe-area-inset-bottom) + var(--gt-h, 0px))';
/**
 * 키보드로 인정하는 최소 축소량(px) — iOS는 URL바가 펼쳐진 상태에서도 레이아웃 뷰포트가
 * 비주얼 뷰포트보다 100 남짓 크다(상·하 브라우저 크롬). 소프트 키보드는 250 이상이라
 * 150이면 둘을 확실히 가른다. 낮게 잡으면 키보드도 없는데 패널이 전체 화면을 덮는다.
 */
const KB_MIN = 150;

/** 키보드 열림 동안의 패널 기하 — 비주얼 뷰포트를 그대로 옮겨 담는다. */
type KbBox = { h: number; top: number };

/**
 * 패널 박스 반영 — 렌더(style prop)와 vv 이벤트(직접 조작)가 **같은 값**을 쓰도록 한 곳에서 만든다.
 * 네 속성을 두 모드 모두에서 명시하는 이유: 한쪽에만 쓰면 모드 전환 때 이전 값이 남는다.
 */
function panelBoxStyle(box: KbBox | null): React.CSSProperties {
  return box
    ? { top: 0, bottom: 'auto', height: box.h, transform: `translateY(${box.top}px)` }
    : { top: PANEL_TOP, bottom: PANEL_BOTTOM, height: 'auto', transform: 'none' };
}
function applyPanelBox(el: HTMLDivElement | null, box: KbBox | null) {
  if (!el) return;
  const s = panelBoxStyle(box);
  el.style.top = typeof s.top === 'number' ? `${s.top}px` : (s.top as string);
  el.style.bottom = s.bottom as string;
  el.style.height = typeof s.height === 'number' ? `${s.height}px` : (s.height as string);
  el.style.transform = s.transform as string;
}
/**
 * 화면 표시 상한(2026-08-07) — 최신 200건 고정. 위로 더 불러오기(페이지네이션)는 두지 않는다:
 * prepend + 스크롤 위치 보존은 버그 표면이 넓고, 채널 보존이 1,000건·7일이라 200이면
 * 실사용 체감상 '대화가 끊기지 않는' 구간을 덮는다.
 */
const PAGE = 200;
/** 친구 목록 → 귓속말 진입 이벤트명. detail = { peerUserId }. */
export const WHISPER_OPEN_EVENT = 'ig:whisper-open';

type LatestIds = { all: string | null; guild: string | null; whisper: string | null };
const EMPTY_IDS: LatestIds = { all: null, guild: null, whisper: null };

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

/** 헤더 탭. 귓속말은 별도 데이터 경로라 버퍼·폴링이 다루는 채널 탭(ChatTab)과 구분한다. */
type Tab = 'all' | 'guild' | 'whisper';
type ChatTab = 'all' | 'guild';

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
  // 소프트 키보드가 열린 동안의 패널 기하(null=키보드 없음 → 기존 CSS 경로).
  const [kbBox, setKbBox] = useState<KbBox | null>(null);
  // 멘션 하이라이트용 내 닉네임.
  const [meNickname, setMeNickname] = useState<string | null>(null);
  // 멘션 자동완성 — 서버 전체 닉네임 prefix 검색 결과(250ms 디바운스).
  const [searchCands, setSearchCands] = useState<string[]>([]);
  // ── 귓속말 —— 내용은 WhisperPane, 여기선 구독 토픽·미읽음 배지·진입 요청만 든다.
  const [whisperTopic, setWhisperTopic] = useState<string | null>(null);
  const [whisperSeed, setWhisperSeed] = useState<WhisperThread[] | null>(null);
  // null = 아직 모름(조회 전). 0이면 "다 읽음"으로 확정 — 노티점 흡수 판단에 쓴다.
  const [whisperUnread, setWhisperUnread] = useState<number | null>(null);
  const [whisperOpen, setWhisperOpen] = useState<WhisperOpenTarget | null>(null);
  // 미니바 노티점 — 서버가 준 채널별 최신 id와 로컬 seen 비교.
  const [notiDot, setNotiDot] = useState(false);

  const openRef = useRef(false);
  const collapsedRef = useRef(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  // 패널 박스 — 키보드 기하를 리렌더 없이 즉시 반영해야 해서 노드를 직접 든다.
  const panelRef = useRef<HTMLDivElement | null>(null);
  // 폴링의 증분(after) 기준점 — 상태를 effect 의존성에 넣지 않고 최신 목록을 읽기 위한 ref.
  const messagesRef = useRef<ChatMessageDto[]>([]);
  // applyNew(장수명 콜백)에서 내 broadcast를 식별하기 위한 미러 — 상태 me와 동기화.
  const meRef = useRef<string | null>(null);
  const serverIdRef = useRef(1);
  // 채널 탭 미러 — 귓속말 탭 중에도 직전 채널을 유지한다(목록·폴링·버퍼는 계속 그 채널 기준).
  const tabRef = useRef<ChatTab>('all');
  if (tab !== 'whisper') tabRef.current = tab;
  // 헤더에서 보고 있는 탭(귓속말 포함) — 장수명 콜백이 읽는 미러(아래 effect로 동기화).
  const viewTabRef = useRef<Tab>('all');
  // 탭별 버퍼(전환 즉시 표시용) — 활성 탭은 messages 상태가 원본, 비활성 탭은 여기.
  const bufRef = useRef<Record<ChatTab, { messages: ChatMessageDto[] }>>({
    all: { messages: [] },
    guild: { messages: [] },
  });
  // 미니바 노티점용 — 서버 최신 id / 로컬 확인 id. 값 변화가 렌더를 부르지 않도록 ref.
  const latestIdsRef = useRef<LatestIds>(EMPTY_IDS);
  const seenRef = useRef<LatestIds>(EMPTY_IDS);
  // 저장된 seen이 없는 첫 방문 — 첫 응답의 최신 id를 그대로 확인 처리(설치 직후 점 방지).
  const seenPrimedRef = useRef(false);
  const whisperUnreadRef = useRef<number | null>(null);
  const myGuildIdRef = useRef<string | null>(null);
  // 길드 채널 id 로컬 캐시(서버별) — 아래 rememberGid/GID_KEY 주석 참조.
  const gidCacheRef = useRef<{ sid: number; gid: string } | null>(null);
  // 실시간 귓속말 싱크 — WhisperPane이 마운트된 동안만 등록된다(반환 true=활성 스레드가 소비).
  const whisperSinkRef = useRef<((m: WhisperMessageDto) => boolean) | null>(null);
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
    viewTabRef.current = tab;
    whisperUnreadRef.current = whisperUnread;
  }, [collapsed, messages, me, tab, whisperUnread]);

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
    try {
      const raw = localStorage.getItem(SEEN_KEY);
      if (raw) {
        const d = JSON.parse(raw) as Partial<LatestIds>;
        seenRef.current = {
          all: typeof d.all === 'string' ? d.all : null,
          guild: typeof d.guild === 'string' ? d.guild : null,
          whisper: typeof d.whisper === 'string' ? d.whisper : null,
        };
        seenPrimedRef.current = true;
      }
    } catch {
      /* ignore */
    }
    try {
      const raw = localStorage.getItem(GID_KEY);
      if (raw) {
        const d = JSON.parse(raw) as { sid?: unknown; gid?: unknown };
        if (typeof d.sid === 'number' && typeof d.gid === 'string') {
          gidCacheRef.current = { sid: d.sid, gid: d.gid };
        }
      }
    } catch {
      /* ignore */
    }
  }, []);

  /**
   * 길드 채널 id 캐시 갱신 — 전체 조회(비-lite) 응답에서만 부른다. null이면 삭제(탈퇴·해산).
   * 클라 저장이지만 새는 정보가 없다: 서버는 이 gid로 `그 서버 × 그 길드`의 최신 메시지 id
   * **하나**만 계산하고(본문·소속 미노출), 실제 길드 메시지 조회는 그대로 소속 검증을 거친다.
   */
  const rememberGid = useCallback((gid: string | null) => {
    if (!gid) {
      gidCacheRef.current = null;
      try {
        localStorage.removeItem(GID_KEY);
      } catch {
        /* ignore */
      }
      return;
    }
    const next = { sid: serverIdRef.current, gid };
    const cur = gidCacheRef.current;
    if (cur && cur.sid === next.sid && cur.gid === next.gid) return;
    gidCacheRef.current = next;
    try {
      localStorage.setItem(GID_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }, []);

  /**
   * ── 미니바 노티점 —— 서버 latestIds vs 로컬 seen. 어느 채널이든 새 것이면 점.
   * 귓속말은 '내용·발신자'를 미니바에 절대 노출하지 않으므로 점만 켠다(프라이버시).
   *
   * 의도: 미니바 **본문은 항상 전체 채널**, **점은 전체/길드/귓속말 공통 1개**. 그래서 세 채널이
   * 각각 점을 켤 수 있어야 한다 — 확인 경로:
   *  · 전체  — lite 폴링이 `latestIds.all`을 항상 준다 → seen.all과 다르면 점.
   *  · 길드  — lite 응답엔 소속 정보가 없어 서버가 `gid` 파라미터로만 길드 최신 id를 계산한다.
   *            gid는 전체 조회로 배운 값(myGuildIdRef) 또는 로컬 캐시(gidCacheRef)에서 나온다.
   *            둘 다 비면 `latestIds.guild`가 null로 와서 **점이 영영 안 켜진다**(2026-08-07 버그A).
   *  · 귓속말 — `latestIds.whisper`(내 수신함 최신 id) ≠ seen.whisper.
   * seen은 "실제로 그 채널을 본 순간"에만 전진한다(아래 absorbSeen) — 닫힌 상태에서 전진시키면
   * 새 메시지를 본 적도 없이 삼켜 점이 안 켜진다.
   */
  const recomputeDot = useCallback(() => {
    const ids = latestIdsRef.current;
    const s = seenRef.current;
    setNotiDot(
      (!!ids.all && ids.all !== s.all) ||
        (!!ids.guild && ids.guild !== s.guild) ||
        (!!ids.whisper && ids.whisper !== s.whisper),
    );
  }, []);
  const setSeen = useCallback(
    (ch: keyof LatestIds, id: string | null) => {
      if (!id || id.startsWith('tmp-') || seenRef.current[ch] === id) return;
      seenRef.current = { ...seenRef.current, [ch]: id };
      try {
        localStorage.setItem(SEEN_KEY, JSON.stringify(seenRef.current));
      } catch {
        /* ignore */
      }
      recomputeDot();
    },
    [recomputeDot],
  );
  /** 지금 **보고 있는** 채널만 서버 최신 id를 확인 처리한다(닫힌 상태에선 어느 채널도 전진 없음). */
  const absorbSeen = useCallback(() => {
    const ids = latestIdsRef.current;
    // 첫 방문 — 기록이 없으면 "이미 다 본 상태"에서 시작한다(서버 id가 하나라도 온 뒤에).
    if (!seenPrimedRef.current) {
      if (!ids.all && !ids.guild && !ids.whisper) return;
      seenPrimedRef.current = true;
      seenRef.current = { ...ids };
      try {
        localStorage.setItem(SEEN_KEY, JSON.stringify(seenRef.current));
      } catch {
        /* ignore */
      }
      setNotiDot(false);
      return;
    }
    if (openRef.current) {
      if (viewTabRef.current === 'all') setSeen('all', ids.all);
      else if (viewTabRef.current === 'guild') setSeen('guild', ids.guild);
      // 귓속말 흡수는 **패널 열림 + WhisperPane 마운트 중**(=귓속말 탭)에만 — 그때만 threads가
      // 신선해 unread 0을 믿을 수 있다. 닫힌 상태에서도 돌렸더니, 마지막으로 알던 unread가
      // 0이면 새 귓속말의 최신 id를 '본 것'으로 삼켜 점이 영영 안 켜졌다(2026-08-07 버그B).
      if (viewTabRef.current === 'whisper' && whisperUnreadRef.current === 0) {
        setSeen('whisper', ids.whisper);
      }
    }
    recomputeDot();
  }, [recomputeDot, setSeen]);

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
      // 닫힘 중에도 목록 버퍼를 채움 — 패널을 열 때 과거 목록이 먼저 보였다가 교체되는
      // 플래시 없이 즉시 현재 대화가 보이게(2026-07-21 피드백). 열림 시 fetch(PAGE)가 정합 보정.
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
        return next.length > PAGE ? next.slice(-PAGE) : next;
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

  /**
   * 키보드 기하 — **계산식 보정이 아니라 비주얼 뷰포트 직결**(2026-08-07 재구조).
   *
   * 예전엔 top/bottom을 `max(키보드높이, GNB오프셋)` 같은 식으로 밀었다. 이론상 맞는 식인데
   * 실기기 iOS에선 어긋난다 — 키보드 등장 애니메이션·URL바 접힘·"포커스된 필드를 보이게 하려고
   * 레이아웃 뷰포트 안에서 비주얼 뷰포트를 아래로 팬하는" 동작이 서로 다른 프레임에 들어와,
   * 어느 한 프레임에서는 패널이 키보드에 못 붙거나(그 틈으로 GNB·배경 노출) 화면 위로 밀려
   * 나갔다(타이핑 중인 검색바가 사라짐). 식이 참조하는 값이 프레임마다 정합하지 않는 게 원인이라
   * 항을 더 붙이는 방식으로는 끝이 안 난다.
   *
   * 그래서 키보드가 열린 동안은 패널 박스를 비주얼 뷰포트 **그 자체**로 만든다:
   * top 0 · height = vv.height · translateY(vv.offsetTop). 화면(비주얼 뷰포트) 전체를 덮으므로
   * 헤더·GNB가 비칠 틈이 구조적으로 없고, 내부가 flex라 입력줄은 늘 키보드 바로 위다.
   * 키보드가 닫히면(kb=0) 기존 CSS 경로(PANEL_TOP/PANEL_BOTTOM)로 그대로 돌아간다 —
   * 두 모드 분기라 무키보드 동작은 완전히 보존된다.
   *
   * 반영은 ref+style 직접 조작이 먼저(리딩 에지), setState는 같은 값을 뒤따른다 — 등장
   * 애니메이션 중에는 React 리렌더 한 틱만 늦어도 그 프레임에 배경이 보인다.
   */
  useEffect(() => {
    if (!open) return;
    const vv = window.visualViewport;
    if (!vv) return;
    let raf = 0;
    let prevOn = false;
    const update = () => {
      // 레이아웃 뷰포트 대비 축소량으로 판정 — 팬(offsetTop>0) 중에도 값이 흔들리지 않는다.
      const on = window.innerHeight - vv.height > KB_MIN;
      const box: KbBox | null = on
        ? { h: Math.round(vv.height), top: Math.round(Math.max(0, vv.offsetTop)) }
        : null;
      applyPanelBox(panelRef.current, box);
      setKbBox((prev) => {
        if (!box) return prev === null ? prev : null;
        return prev && prev.h === box.h && prev.top === box.top ? prev : box;
      });
      // 키보드가 '열리는 전이'에만 바닥 고정 — 열린 채 유지 중엔 스크롤을 뺏지 않는다
      // (visualViewport는 스크롤 중에도 발화해, 매번 바닥으로 끌면 위로 못 읽는다).
      if (on && !prevOn) requestAnimationFrame(() => scrollToBottom());
      prevOn = on;
    };
    // rAF 스로틀(리딩 에지) — 이벤트 즉시 1회 반영하고, 같은 프레임의 나머지는 프레임 끝 1회로 묶는다.
    const onVv = () => {
      update();
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        update();
      });
    };
    update();
    vv.addEventListener('resize', onVv);
    vv.addEventListener('scroll', onVv);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      vv.removeEventListener('resize', onVv);
      vv.removeEventListener('scroll', onVv);
      setKbBox(null);
    };
  }, [open, scrollToBottom]);

  const fetchRecent = useCallback(
    // lite=닫힌 미니바 상시 폴링용 경량 조회(메시지만) — 서버가 차단목록·닉네임·길드 조회를
    // 생략하므로(DB 절감) 채널·차단 등 부속 상태는 초기/전체 조회 값을 유지한다.
    // after=증분 폴링(2026-08-06): 마지막으로 본 항목 id 이후만 델타로 받는다(평시 응답 0~3건).
    // 서버가 after를 못 찾으면 full로 응답 — 반환 mode로 구분해 append/치환을 가른다.
    async (
      limit: number,
      forTab?: ChatTab,
      lite?: boolean,
      after?: string | null,
      // 요청 채널을 호출처가 명시하고 결과도 채널 기준으로 라우팅하는 경우(닫힘 미니바의
      // 전체 채널 고정 폴링) — 활성 탭 가드를 건너뛴다.
      anyTab?: boolean,
    ): Promise<{ mode: 'full' | 'delta'; messages: ChatMessageDto[] } | null> => {
      const t = forTab ?? tabRef.current;
      try {
        // gid — 서버가 길드 채널 최신 id(latestIds.guild)를 계산할 때만 쓴다(모르면 생략).
        // 로컬 캐시 폴백 — 전체 조회 전(새로고침 직후 닫힌 상태)엔 소속을 아직 모른다.
        // 서버가 다른 캐시는 sid 확인 시점에 지워지고, 남아도 `server_id`가 안 맞아 null이 온다.
        const gid = myGuildIdRef.current ?? gidCacheRef.current?.gid ?? null;
        const res = await fetch(
          `/api/chat/recent?limit=${limit}&channel=${t}${lite ? '&lite=1' : ''}${
            after ? `&after=${encodeURIComponent(after)}` : ''
          }${lite && gid ? `&gid=${encodeURIComponent(gid)}` : ''}`,
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
          whisperChannel?: string | null;
          blocked?: { id: string; nickname: string }[];
          latestIds?: LatestIds;
        };
        if (data.disabled) {
          setEnabled(false);
          return null;
        }
        setEnabled(true);
        // 미니바 노티점 — 채널별 최신 id는 탭과 무관하게 항상 흡수한다.
        if (data.latestIds) {
          latestIdsRef.current = {
            all: data.latestIds.all ?? null,
            guild: data.latestIds.guild ?? latestIdsRef.current.guild,
            whisper: data.latestIds.whisper ?? null,
          };
          absorbSeen();
        }
        // 응답이 도착한 시점의 활성 탭과 요청 탭이 다르면(빠른 전환) 채널·목록 반영 스킵.
        if (!anyTab && t !== tabRef.current) return null;
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
          // 귓속말 수신 토픽 — threads 응답의 topic과 같은 값이라 하나의 상태로 합쳐 관리한다.
          // 값이 없을 때 null로 덮지 않는 이유: 이미 threads가 준 토픽이 있으면 그게 정답이고,
          // 여기서 지우면 상시 구독이 잠깐 끊긴다.
          setWhisperTopic((prev) => data.whisperChannel ?? prev);
          // 소속을 확인한 유일한 지점 — 캐시도 여기서만 쓰고 지운다(탈퇴·해산이면 null → 삭제).
          rememberGid(data.guild?.id ?? null);
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
    [absorbSeen, rememberGid],
  );

  // 초기 로드 — 최근 1개(미니바 = 항상 전체 채널).
  useEffect(() => {
    void fetchRecent(1, 'all', false, null, true).then((r) => {
      const lastUser = r ? [...r.messages].reverse().find((m) => !m.sys && !m.sysGuild) : null;
      if (lastUser) setLatest(lastUser);
    });
  }, [fetchRecent]);

  // 수신 라우팅 — 활성 탭이면 화면(applyNew), 비활성 탭이면 버퍼에만 적재(전환 즉시 표시).
  // 미니바는 탭과 무관하게 전체 채널만 보여주므로 latest는 'all'에서만 갱신한다.
  const routeIncoming = useCallback(
    (t: ChatTab, m: ChatMessageDto) => {
      if (t === 'all' && !m.sys && !m.sysGuild) setLatest(m);
      // 보고 있는 채널이면 그 자리에서 확인 처리(다음 폴링의 latestIds와 같은 id).
      if (openRef.current && viewTabRef.current === t) setSeen(t, m.id);
      if (t === tabRef.current) {
        applyNew(m);
        return;
      }
      const b = bufRef.current[t];
      if (!b.messages.some((x) => x.id === m.id)) {
        b.messages = [...b.messages, m].slice(-PAGE);
      }
    },
    [applyNew, setSeen],
  );

  // 서버 전환(sid 변경) 감지 — 버퍼·미니바 초기화. 구독 여부와 무관하게 실행되어야 해서
  // 구독 effect와 분리(닫힌 채 서버를 옮겨도 옛 서버 메시지가 남지 않도록).
  const prevSidRef = useRef<number | null>(null);
  useEffect(() => {
    if (sid === null) return;
    // 다른 서버에서 저장한 길드 id는 여기서 버린다(남겨두면 잘못된 채널의 최신 id를 묻게 된다).
    if (gidCacheRef.current && gidCacheRef.current.sid !== sid) rememberGid(null);
    if (prevSidRef.current !== null && prevSidRef.current !== sid) {
      setMessages([]);
      setLatest(null);
      myFieldsRef.current = null;
      bufRef.current = { all: { messages: [] }, guild: { messages: [] } };
    }
    prevSidRef.current = sid;
  }, [sid, rememberGid]);

  // Realtime 구독 — **패널이 열린 동안만**(2026-08-06, 동접 1천 대비). 닫힌 유저까지 상시
  // 구독하면 동시 연결이 접속자 수만큼 쌓이고(Pro 한도 500), broadcast 1건이 전원에게
  // fan-out되어 메시지 쿼터를 태운다. 닫힘 미니바는 코얼레싱 미니 토픽(아래 effect)+60초
  // 폴링 안전망이 담당.
  // 열림 중엔 전체+내 길드 채널 동시 구독(탭 전환 시 재구독 없음 → 전환 즉시).
  // 귓속말 토픽은 여기 없다 — 열림/닫힘 공통 1개 구독으로 분리했다(아래 상시 구독 effect).
  useEffect(() => {
    if (enabled !== true || sid === null || !open) return;
    const sb = supabaseBrowser();
    if (!sb) return;
    const mk = (topic: string, t: ChatTab) =>
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

  /**
   * 귓속말 수신 토픽 — **도크 열림/닫힘과 무관하게 상시 1개 구독**(전체/길드와 비대칭).
   *
   * 비대칭의 이유는 fan-out 폭이다: 전체·길드 broadcast 1건은 그 채널을 보고 있는 **전원**에게
   * 복제되므로 닫힌 유저까지 상시 구독시키면 동시 연결·메시지 쿼터가 접속자 수에 비례해 터진다
   * (그래서 닫힘은 코얼레싱 미니 토픽 + 폴링). 귓속말은 1:1이라 한 건의 수신자가 1명뿐이고,
   * 연결도 유저당 1개라 상시 구독의 추가 비용이 사실상 없다. 대신 얻는 것은 닫힌 상태에서도
   * 새 귓속말이 오는 즉시 켜지는 노티점이다(폴링 주기 60~180초를 기다리지 않는다).
   *
   * 토픽은 서버 발급값만 쓴다(threads 응답 topic == recent 응답 whisperChannel, 같은 함수).
   * 미니바에는 내용·발신자를 절대 올리지 않는다 — 점만 켠다(프라이버시).
   */
  useEffect(() => {
    if (enabled !== true || !whisperTopic) return;
    const sb = supabaseBrowser();
    if (!sb) return;
    const ch = sb
      .channel(whisperTopic)
      .on('broadcast', { event: 'new' }, ({ payload }) => {
        const m = payload as WhisperMessageDto;
        // 패널이 열려 있으면 기존 sink 경로가 우선 — 지금 그 스레드를 보고 있으면 즉시 소비한다
        // (WhisperPane 미마운트 = 닫힘·다른 탭이면 sink가 없어 false).
        const consumed = whisperSinkRef.current?.(m) ?? false;
        // 내가 보낸 메시지(멀티기기 동기화 수신)는 점도 미읽음도 아니다.
        if (m.fromUserId === meRef.current) return;
        if (!consumed) setWhisperUnread((n) => (n ?? 0) + 1);
        if (m.toUserId !== meRef.current) return;
        latestIdsRef.current = { ...latestIdsRef.current, whisper: m.id };
        // 소비했으면 그 자리에서 확인 처리(점 억제) — 채널 탭의 routeIncoming과 같은 규칙.
        if (consumed) setSeen('whisper', m.id);
        else recomputeDot();
      })
      .subscribe();
    return () => {
      void sb.removeChannel(ch);
    };
  }, [enabled, whisperTopic, recomputeDot, setSeen]);

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

  // 길드 탈퇴/해산 감지 — 길드 버퍼 잔존 제거.
  useEffect(() => {
    myGuildIdRef.current = myGuild?.id ?? null;
    if (myGuild) return;
    bufRef.current.guild = { messages: [] };
  }, [myGuild]);

  // 비활성 탭 선적재 — 길드 소속이 확인되면 길드 버퍼를 미리 채워 첫 전환도 즉시.
  useEffect(() => {
    if (!myGuild || bufRef.current.guild.messages.length > 0) return;
    void fetch('/api/chat/recent?limit=50&channel=guild&lite=1', { cache: 'no-store' })
      .then(async (r) => (r.ok ? ((await r.json()) as { messages?: ChatMessageDto[] }) : null))
      .then((d) => {
        if (!d?.messages || tabRef.current === 'guild') return;
        bufRef.current.guild = { messages: d.messages };
      })
      .catch(() => {
        /* 무시 — 전환 시 재조회 */
      });
  }, [myGuild?.id]);

  // 귓속말 목록 선조회 — 패널을 열 때 1회. 탭 미읽음 배지의 원천이다(귓속말 탭을 열지 않아도
  // 배지가 맞아야 하므로 도크가 직접 받는다 — WhisperPane은 자기 마운트 시점에 다시 받아
  // onThreads로 최신값을 되돌려준다). 실시간 토픽은 마운트 직후 전체 조회(whisperChannel)가
  // 이미 채워둔 값과 같다 — 같은 상태에 덮어써도 참조가 같아 재구독이 일어나지 않는다.
  const whisperFetchedRef = useRef(false);
  useEffect(() => {
    if (!open) {
      whisperFetchedRef.current = false;
      return;
    }
    if (enabled !== true || whisperFetchedRef.current) return;
    whisperFetchedRef.current = true;
    void fetch('/api/chat/whisper/threads', { cache: 'no-store' })
      .then(async (r) => (r.ok ? ((await r.json()) as WhisperThreadsRes) : null))
      .then((d) => {
        if (!d) return;
        setWhisperTopic((prev) => d.topic ?? prev);
        setWhisperSeed(d.threads ?? []);
        setWhisperUnread((d.threads ?? []).reduce((s, t) => s + (t.unread || 0), 0));
      })
      .catch(() => {
        /* 무시 — 귓속말 탭 진입 시 재조회 */
      });
  }, [open, enabled]);

  // 귓속말 탭에서 미읽음이 0으로 확정되는 순간 최신 id를 확인 처리(미니바 점 해제).
  // 탭·열림도 의존성 — 귓속말 탭으로 들어온 그 순간에도 판정이 돌아야 한다.
  useEffect(() => {
    absorbSeen();
  }, [whisperUnread, tab, open, absorbSeen]);

  // 폴링 — Realtime(WS) 백업 + 닫힘 미니바의 유일한 수신 경로(2026-08-06: WS는 열림 시에만).
  // 열림=PAGE(after 증분 — 평시 델타 0~3건), 닫힘=1(lite: 1건·부속 조회 생략).
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
      // 닫힘 폴링은 **항상 전체 채널** — 미니바가 탭과 무관하게 전체 최신만 보여주기 때문.
      // 결과는 routeIncoming('all')로 흘려 활성 탭이 길드여도 목록이 섞이지 않는다.
      // 폴링은 열림/닫힘 모두 lite — 차단목록·닉네임·토픽 부속 쿼리는 열기/탭 전환의
      // 전체 조회가 담당(값이 바뀌는 이벤트가 그때뿐). 월드 lite+캐시 히트 = DB 0쿼리.
      void fetchRecent(wasOpen ? PAGE : 1, wasOpen ? undefined : 'all', true, after, !wasOpen).then((r) => {
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
                return next.length > PAGE ? next.slice(-PAGE) : next;
              });
              const el = listRef.current;
              if (el && el.scrollHeight - el.scrollTop - el.clientHeight < 120)
                requestAnimationFrame(() => scrollToBottom(true));
              else setUnseenBelow(true);
            }
          } else {
            setMessages((prev) => [...ms, ...prev.filter((m) => m.id.startsWith('tmp-'))]);
          }
          // 열림 폴링은 활성 채널 탭 기준 — 미니바(전체 최신)는 전체 탭일 때만 갱신.
          if (tabRef.current === 'all') {
            const lastUser = [...ms].reverse().find((m) => !m.sys && !m.sysGuild);
            if (lastUser) setLatest(lastUser);
          }
        } else if (ms.length > 0) routeIncoming('all', ms[ms.length - 1]!);
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
  }, [enabled, fetchRecent, routeIncoming, scrollToBottom]);

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
    void fetchRecent(PAGE).then((r) => {
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

  // 탭 전환 — 캐시 버퍼를 즉시 표시(렉 없음), 백그라운드 재조회로 정합 보정.
  // 구독은 세 채널 상시 유지라 재구독 비용도 없음.
  // 귓속말은 채널 탭(전체/길드)의 목록·버퍼를 건드리지 않는다 — 되돌아오면 보던 그대로.
  const switchTab = (next: Tab, limitOverride?: number) => {
    if (next === tab) return;
    if (next === 'whisper') {
      setTab(next);
      setUnseenBelow(false);
      return;
    }
    const cur = tabRef.current;
    if (next !== cur) {
      // 현재 채널 탭 상태를 버퍼로 저장 후 다음 탭 버퍼를 즉시 로드.
      bufRef.current[cur] = { messages };
      tabRef.current = next;
      setMessages(bufRef.current[next].messages);
    }
    setTab(next);
    setUnseenBelow(false);
    needInitialScrollRef.current = true;
    void fetchRecent(limitOverride ?? (open ? PAGE : 1), next).then((r) => {
      if (!r) return;
      // 탭 전환 응답 — 그 사이 위로 스크롤해 읽는 중이면 바닥 고정을 생략(스크롤 강탈 방지).
      const el = listRef.current;
      if (!el || el.scrollHeight - el.scrollTop - el.clientHeight < 120)
        needInitialScrollRef.current = true;
      setMessages((prev) => [...r.messages, ...prev.filter((m) => m.id.startsWith('tmp-'))]);
      if (next === 'all') {
        const lastUser = [...r.messages].reverse().find((m) => !m.sys && !m.sysGuild);
        if (lastUser) setLatest(lastUser);
      }
      setSeen(next, [...r.messages].reverse().find((m) => !m.id.startsWith('tmp-'))?.id ?? null);
    });
  };

  // 푸시 클릭 목적지(?chat=all|guild|whisper[&peer=publicCode]) — 채팅창을 해당 탭으로 오픈.
  // 처리 후 쿼리 제거.
  const openFromPushRef = useRef<(url: string) => void>(() => {});
  openFromPushRef.current = (url: string) => {
    let chat: string | null = null;
    let peer: string | null = null;
    try {
      const sp = new URL(url, location.origin).searchParams;
      chat = sp.get('chat');
      peer = sp.get('peer');
    } catch {
      return;
    }
    if (chat !== 'all' && chat !== 'guild' && chat !== 'whisper') return;
    if (chat === 'whisper') {
      switchTab('whisper');
      // peer는 공개코드 — userId 해석은 WhisperPane이 목록 매칭/검색으로 처리한다.
      if (peer) setWhisperOpen({ publicCode: peer });
    } else if (chat !== tabRef.current || tab === 'whisper') {
      switchTab(chat, PAGE);
    }
    openPanel();
    try {
      const u = new URL(location.href);
      if (u.searchParams.has('chat') || u.searchParams.has('peer')) {
        u.searchParams.delete('chat');
        u.searchParams.delete('peer');
        history.replaceState(null, '', u.pathname + (u.search ? u.search : ''));
      }
    } catch {
      /* ignore */
    }
  };

  /**
   * 친구 목록 등 외부 화면 → 귓속말 진입. 도크가 전역(레이아웃)이라 직접 조작이 불가해
   * window CustomEvent로 신호받는다. detail = { peerUserId }.
   */
  // 최신 클로저 미러 — 리스너는 마운트 1회만 건다(위 openFromPushRef와 동일 패턴).
  const openWhisperRef = useRef<(peerUserId: string) => void>(() => {});
  openWhisperRef.current = (peerUserId: string) => {
    switchTab('whisper');
    setWhisperOpen({ userId: peerUserId });
    setCollapsedUnseen(false);
    if (!open) openPanel();
  };
  useEffect(() => {
    const onOpen = (e: Event) => {
      const d = (e as CustomEvent<{ peerUserId?: string }>).detail;
      if (d?.peerUserId) openWhisperRef.current(d.peerUserId);
    };
    window.addEventListener(WHISPER_OPEN_EVENT, onOpen);
    return () => window.removeEventListener(WHISPER_OPEN_EVENT, onOpen);
  }, []);
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
        // 미니바는 전체 채널만 — 길드 발언은 미니바를 바꾸지 않는다.
        if (sentTab === 'all') setLatest(r.message);
        if (sentTab === tabRef.current) {
          setMessages((prev) => {
            const rest = prev.filter((m) => m.id !== tempId);
            // 내 broadcast가 먼저 도착해 이미 실 메시지가 있으면 temp만 제거.
            return rest.some((m) => m.id === r.message.id) ? rest : [...rest, r.message];
          });
        } else {
          const b = bufRef.current[sentTab];
          const rest = b.messages.filter((m) => m.id !== tempId);
          b.messages = rest.some((m) => m.id === r.message.id) ? rest : [...rest, r.message];
        }
        setSeen(sentTab, r.message.id);
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

  // ── WhisperPane 연결 콜백 —— 전부 안정 참조(패널 내부 effect 재실행 방지).
  const handleWhisperThreads = useCallback((res: WhisperThreadsRes) => {
    // 토픽은 recent(whisperChannel)·threads(topic)가 같은 값을 주는 단일 상태 — 빈 응답이
    // 상시 구독을 끊지 않도록 없을 때만 이전 값을 유지한다.
    setWhisperTopic((prev) => res.topic ?? prev);
    setWhisperSeed(res.threads ?? []);
  }, []);
  const handleWhisperUnread = useCallback((n: number) => setWhisperUnread(n), []);
  const registerWhisperSink = useCallback(
    (fn: ((m: WhisperMessageDto) => boolean) | null) => {
      whisperSinkRef.current = fn;
    },
    [],
  );
  const consumeWhisperOpen = useCallback(() => setWhisperOpen(null), []);

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
                className="pointer-events-auto flex h-[34px] w-[34px] items-center justify-center rounded-full border border-zinc-200/70 bg-white/70 backdrop-blur-md dark:border-zinc-700/60 dark:bg-zinc-900/70"
              >
                {/* 점은 항상 말풍선 아이콘의 왼쪽 위 — 접힘/펼침에서 같은 자리에 보이도록
                    바(가변 폭)가 아니라 아이콘을 기준으로 단다(2026-08-07 피드백). */}
                <span aria-hidden className="relative text-[12px]">
                  💬
                  {collapsedUnseen || notiDot ? (
                    <span className="absolute -top-[3px] -left-[3px] h-1.5 w-1.5 rounded-full bg-amber-500 ring-2 ring-white dark:ring-zinc-900" />
                  ) : null}
                </span>
              </button>
            ) : (
              // 펼침 — 미니바 본문은 **탭과 무관하게 항상 전체 채널 최신 1건**.
              // 귓속말은 내용·발신자를 여기 절대 노출하지 않고, 새 소식은 우상단 점으로만 알린다.
              <div className="pointer-events-auto relative flex h-[34px] w-full items-center rounded-full border border-zinc-200/70 bg-white/70 pr-3 pl-1.5 backdrop-blur-md dark:border-zinc-700/60 dark:bg-zinc-900/70">
                <button
                  type="button"
                  onClick={toggleCollapsed}
                  aria-label="채팅 접기"
                  className="flex h-full shrink-0 items-center px-1.5 text-[12px]"
                >
                  <span aria-hidden className="relative">
                    💬
                    {notiDot ? (
                      <span className="absolute -top-[3px] -left-[3px] h-1.5 w-1.5 rounded-full bg-amber-500 ring-2 ring-white dark:ring-zinc-900" />
                    ) : null}
                  </span>
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
                    <span className="flex-1 truncate text-[11px] text-zinc-400">전체 채팅</span>
                  )}
                </button>
              </div>
            )}
          </div>
        </div>
      ) : null}

      {/* 전체 패널 — 헤더·GNB 사이를 덮는 불투명 오버레이 */}
      {open ? (
        // z-40 — 키보드 모드에서 패널이 화면 전체를 덮는데, 헤더(z-30)·GNB(z-30)가 그 위로
        // 그려지면 덮은 의미가 없다(모달 z-50 아래는 유지). 무키보드 모드에선 겹치는 구간
        // 자체가 없어 z만 올라간다.
        <div ref={panelRef} className="fixed inset-x-0 z-40" style={panelBoxStyle(kbBox)}>
          <div className="relative mx-auto flex h-full w-full max-w-[390px] flex-col bg-white dark:bg-zinc-950">
            <header className="flex shrink-0 items-center justify-between gap-2 border-b border-zinc-100 px-3 py-1.5 dark:border-zinc-800/70">
              <div className="flex items-center gap-4">
                {(['all', 'guild', 'whisper'] as const).map((tk) => (
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
                    {tk === 'all' ? '전체' : tk === 'guild' ? '길드' : '귓속말'}
                    {tk === 'whisper' && (whisperUnread ?? 0) > 0 ? (
                      <span
                        aria-hidden
                        className="absolute -top-px -right-[7px] h-[5px] w-[5px] rounded-full bg-amber-500"
                      />
                    ) : null}
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

            {tab === 'whisper' ? (
              <WhisperPane
                me={me}
                meNickname={meNickname}
                serverId={sid ?? 1}
                seed={whisperSeed}
                blocked={blocked}
                openTarget={whisperOpen}
                onOpenTargetConsumed={consumeWhisperOpen}
                onThreads={handleWhisperThreads}
                onUnread={handleWhisperUnread}
                registerSink={registerWhisperSink}
                onProfile={openProfile}
                onToggleBlock={toggleBlock}
                onClose={() => setOpen(false)}
              />
            ) : (
              <>
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
              {/* 날짜 구분선 — 귓속말 스레드와 같은 컴포넌트·같은 규칙(시스템 라인도 날짜 계산에
                  포함). 구분선을 사이에 두면 연속 발언 묶음도 끊는다(prevMsg 생략). */}
              {(tab !== 'guild' || myGuild) &&
                visibleMessages.map((m, i) => {
                  const prev = visibleMessages[i - 1];
                  const date = chatDateLabel(m.createdAt, prev?.createdAt);
                  return (
                    <Fragment key={m.id}>
                      {date ? <ChatDateDivider label={date} /> : null}
                      <ChatRow
                        m={m}
                        prevMsg={date ? undefined : prev}
                        me={me}
                        meNickname={meNickname}
                        serverId={sid ?? 1}
                        onProfile={openProfile}
                        onReport={onReport}
                      />
                    </Fragment>
                  );
                })}
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
              </>
            )}
          </div>
        </div>
      ) : null}

      {/* 미니 프로필 팝업 — 공통 3단(제목 / 카드 / 버튼). 카드는 자랑 카드식 2분할
          (왼쪽 전신 아바타, 오른쪽 스탯)이라 자체 배경을 가지므로 bare로 둔다. */}
      {profile ? (
        <ModalShell onClose={() => setProfile(null)} label="유저 정보">
          <ModalLayout
            bare
            title={
              <span className="block max-w-full truncate">
                {profile.data.isMeleeChampion ? '🏆 ' : ''}
                {profile.data.nickname}
              </span>
            }
            subtitle={
              profile.data.guildName || profile.data.repTitle ? (
                <span className="flex items-center justify-center gap-1">
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
                    <span className="shrink-0 text-zinc-400">·</span>
                  ) : null}
                  <TitleTag
                    code={profile.data.repTitle}
                    executorZone={profile.data.executorZone}
                    executorZoneRegion={profile.data.executorZoneRegion}
                  />
                </span>
              ) : undefined
            }
            footer={
              // 2단(3/2) — 윗줄은 '상대에게 하는 일'(귓속말·친구·차단), 아랫줄은 '이 팝업에서
              // 나가는 길'(프로필·닫기). 내 프로필이면 윗줄이 통째로 의미가 없어 사라진다.
              // 신고 버튼은 두지 않는다 — 신고는 '어떤 메시지'가 대상이라 본문 탭이 유일한 진입이고,
              // 유저 단위 신고 버튼을 옆에 두면 대상이 모호해진다(전체·길드·귓속말 공통 규칙).
              <div className="flex w-full flex-col gap-2">
                {!profile.data.isMe ? (
                  <div className="flex gap-2">
                    {/* 주 동작 — 유저를 만났을 때 가장 하고 싶은 행동이 말 걸기다. */}
                    <ModalButton
                      tone="primary"
                      onClick={() => {
                        const uid = profile.data.userId;
                        setProfile(null);
                        switchTab('whisper');
                        setWhisperOpen({ userId: uid });
                      }}
                    >
                      귓속말
                    </ModalButton>
                    <ModalButton
                      tone="neutral"
                      disabled={profile.data.friendStatus !== null}
                      onClick={() => {
                        void sendRequestAction(profile.data!.userId).then((r) => {
                          setPopupFlash(
                            r.status === 'success' ? '친구 요청을 보냈어요' : '요청에 실패했어요',
                          );
                          if (r.status === 'success')
                            setProfile((prev) =>
                              prev?.data
                                ? { ...prev, data: { ...prev.data, friendStatus: 'pending' } }
                                : prev,
                            );
                        });
                      }}
                    >
                      {profile.data.friendStatus === 'accepted'
                        ? '친구 ✓'
                        : profile.data.friendStatus === 'pending'
                          ? '요청됨'
                          : '친구 추가'}
                    </ModalButton>
                    <ModalButton
                      tone="neutral"
                      onClick={() => {
                        toggleBlock(profile.data!.userId, profile.data!.nickname);
                        setPopupFlash(
                          blocked.has(profile.data!.userId)
                            ? '차단을 해제했어요'
                            : '이 기기에서 메시지를 숨겨요',
                        );
                      }}
                    >
                      {blocked.has(profile.data.userId) ? '차단 해제' : '차단'}
                    </ModalButton>
                  </div>
                ) : null}
                <div className="flex gap-2">
                  <ModalButton
                    tone="neutral"
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
                  >
                    프로필 보기
                  </ModalButton>
                  <ModalButton tone="ghost" onClick={() => setProfile(null)}>
                    닫기
                  </ModalButton>
                </div>
              </div>
            }
          >
            <div className="bg-gradient-to-br from-amber-50 via-white to-zinc-50 p-4 dark:from-amber-500/[0.09] dark:via-zinc-900 dark:to-zinc-900">
              {/* 버튼 수와 무관하게 높이 고정 — 아바타 위치·크기 불변. */}
              <div className="flex h-[168px] items-stretch gap-2.5">
                {/* 크롭 없음 — 세로를 꽉 채우되 폭은 열 밖으로 넘쳐도 보이게(visible),
                    클립은 카드의 overflow-hidden(라운드)에서만 발생 */}
                <div className="relative w-[140px] shrink-0">
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
                <div className="flex min-w-0 flex-1 flex-col justify-center">
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
                </div>
              </div>
            </div>
          </ModalLayout>
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
