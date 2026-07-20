'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';

import { supabaseBrowser } from '@/lib/supabase-browser';
import { ZoomSafeInput } from '@/components/ui/ZoomSafeField';
import { faceCropStyle, type FaceBox } from '@/components/faceCrop';
import { TranscendSprite } from '@/components/TranscendSprite';
import type { ChatItemSnap, ChatMessageDto } from '@/lib/game/chat/service';
import type { WorldEventEntry } from '@/lib/game/world/event';
import { worldEventMessage } from '@/app/(game)/world-message';
import { sendRequestAction } from '@/app/(game)/friends/actions';

import { sendChat, reportChat, setChatBlockAction } from './actions';

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
  isMeleeChampion: boolean;
  combat: number;
  maxEnhance: number;
  sumEnhance: number;
  raidKills: number;
  meleeWins: number;
  friendStatus: 'pending' | 'accepted' | null;
  isMe: boolean;
};

type MyItem = { id: string; name: string; code: string; slot: ChatItemSnap['s']; e: number; t: number; cp: number };

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
    isMeleeChampion: false,
    item: null,
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
  // 장비 자랑 태그(0127) — 선택기·선택된 장비·메시지 장비 상세 팝업.
  const [showItemPicker, setShowItemPicker] = useState(false);
  const [myItems, setMyItems] = useState<MyItem[] | null>(null);
  const [pickedItem, setPickedItem] = useState<MyItem | null>(null);
  const [itemView, setItemView] = useState<ChatItemSnap | null>(null);
  // 멘션 하이라이트용 내 닉네임.
  const [meNickname, setMeNickname] = useState<string | null>(null);

  const openRef = useRef(false);
  const wsOkRef = useRef(false);
  const listRef = useRef<HTMLDivElement | null>(null);
  const serverIdRef = useRef(1);
  // 낙관 전송용 — 내 표시 필드(닉/아바타/길드)는 서버 응답·최근 목록의 내 메시지에서 채움.
  const myFieldsRef = useRef<ChatMessageDto | null>(null);
  const tempSeqRef = useRef(0);
  // 패널 오픈 직후 첫 렌더를 페인트 전에 바닥으로 — 위가 보였다가 내려가는 깜빡임 방지.
  const needInitialScrollRef = useRef(false);
  openRef.current = open;

  // 튜토리얼 중엔 도크 숨김 — 코치마크·완료 모달과 시각 경합 방지. 차단 목록도 초기 로드.
  useEffect(() => {
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
  const routeEffectRanRef = useRef(false);
  useEffect(() => {
    if (!routeEffectRanRef.current) {
      routeEffectRanRef.current = true;
      return;
    }
    setOpen(false);
    setProfile(null);
    setReportTarget(null);
    setShowBlockList(false);
    setShowItemPicker(false);
    setItemView(null);
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
    if (id && prevLatestIdRef.current && id !== prevLatestIdRef.current && collapsed) {
      setCollapsedUnseen(true);
    }
    if (id) prevLatestIdRef.current = id;
  }, [latest, collapsed, blocked]);

  const scrollToBottom = useCallback((smooth = false) => {
    const el = listRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
  }, []);

  const applyNew = useCallback(
    (m: ChatMessageDto) => {
      if (!m.sys) setLatest(m); // 시스템 라인은 미니바(마지막 채팅)에서 제외.
      // 닫힘 중에도 목록 버퍼를 채움 — 패널을 열 때 과거 목록이 먼저 보였다가 교체되는
      // 플래시 없이 즉시 현재 대화가 보이게(2026-07-21 피드백). 열림 시 fetch(100)가 정합 보정.
      setMessages((prev) => {
        if (prev.some((p) => p.id === m.id)) return prev;
        const next = [...prev, m];
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
    const update = () => {
      const kb = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      setKbOffset(Math.round(kb));
      if (kb > 0) requestAnimationFrame(() => scrollToBottom());
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

  const fetchRecent = useCallback(async (limit: number): Promise<ChatMessageDto[] | null> => {
    try {
      const res = await fetch(`/api/chat/recent?limit=${limit}`, { cache: 'no-store' });
      if (!res.ok) return null;
      const data = (await res.json()) as {
        disabled?: boolean;
        channel?: string;
        me?: string;
        messages: ChatMessageDto[];
        meNickname?: string | null;
        blocked?: { id: string; nickname: string }[];
      };
      if (data.disabled) {
        setEnabled(false);
        return null;
      }
      setEnabled(true);
      if (data.channel) {
        setChannel(data.channel);
        const sid = Number(data.channel.split(':s')[1]);
        if (Number.isInteger(sid)) serverIdRef.current = sid;
      }
      if (data.me) setMe(data.me);
      if (data.meNickname) setMeNickname(data.meNickname);
      if (data.blocked) setBlocked(new Map(data.blocked.map((b) => [b.id, b.nickname])));
      const mine = data.messages.filter((m) => m.userId === data.me).pop();
      if (mine) myFieldsRef.current = mine;
      return data.messages;
    } catch {
      return null;
    }
  }, []);

  // 초기 로드 — 최근 1개(미니바).
  useEffect(() => {
    void fetchRecent(1).then((ms) => {
      const lastUser = ms ? [...ms].reverse().find((m) => !m.sys) : null;
      if (lastUser) setLatest(lastUser);
    });
  }, [fetchRecent]);

  // Realtime 구독 — 채널 확정 후 1회. 실패 시 폴링 폴백(아래 별도 effect).
  useEffect(() => {
    if (!channel) return;
    const sb = supabaseBrowser();
    if (!sb) return;
    const ch = sb
      .channel(channel)
      .on('broadcast', { event: 'new' }, ({ payload }) => applyNew(payload as ChatMessageDto))
      .on('broadcast', { event: 'sys' }, ({ payload }) => applyNew(sysToMsg(payload as WorldEventEntry)))
      .on('broadcast', { event: 'hide' }, ({ payload }) => {
        const id = (payload as { id: string }).id;
        setMessages((prev) => prev.filter((m) => m.id !== id));
        setLatest((prev) => (prev?.id === id ? null : prev));
      })
      .subscribe((status) => {
        wsOkRef.current = status === 'SUBSCRIBED';
      });
    return () => {
      wsOkRef.current = false;
      void sb.removeChannel(ch);
    };
  }, [channel, applyNew]);

  // 폴링 — WS 상태와 무관하게 상시 15초(2026-07-21): WS가 SUBSCRIBED여도 서버측 송신
  // 실패 등으로 조용히 끊긴 상태를 커버(최대 15초 내 미니바·목록 복구). 열림=100, 닫힘=1.
  useEffect(() => {
    if (enabled === false) return;
    const t = setInterval(() => {
      void fetchRecent(openRef.current ? 100 : 1).then((ms) => {
        if (!ms) return;
        if (openRef.current) setMessages(ms);
        else if (ms.length > 0) applyNew(ms[ms.length - 1]!);
        const lastUser = [...ms].reverse().find((m) => !m.sys);
        if (lastUser) setLatest(lastUser);
      });
    }, 15000);
    return () => clearInterval(t);
  }, [enabled, fetchRecent, applyNew]);

  // 쿨다운 카운트다운.
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const openPanel = () => {
    setOpen(true);
    setUnseenBelow(false);
    needInitialScrollRef.current = true;
    void fetchRecent(100).then((ms) => {
      if (ms) {
        needInitialScrollRef.current = true; // fetch 반영 렌더도 페인트 전 바닥 고정.
        setMessages(ms);
      }
    });
  };

  // 페인트 전 바닥 스크롤 — openPanel 직후 렌더(이전 목록)와 fetch 반영 렌더 모두.
  useLayoutEffect(() => {
    if (!open || !needInitialScrollRef.current || messages.length === 0) return;
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
    needInitialScrollRef.current = false;
  }, [open, messages]);

  // '프로필 보기'로 나갔다 돌아온 마운트 — 채팅 패널 + 유저 팝업을 저장분으로 즉시 복원
  // (닫힘→재오픈 깜빡임 없음), 이후 백그라운드 재조회로 최신화(1회 소비).
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(RESTORE_KEY);
      if (!raw) return;
      sessionStorage.removeItem(RESTORE_KEY);
      const data = JSON.parse(raw) as MiniProfile;
      openPanel();
      setProfile({ userId: data.userId, data });
      openProfile(data.userId);
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const flashError = (msg: string) => {
    setError(msg);
    setTimeout(() => setError(null), 3000);
  };

  // 낙관 전송(2026-07-20 피드백) — 즉시 내 말풍선을 띄우고 서버 확정 시 실 메시지로 교체.
  // 실패하면 말풍선 회수 + 입력 복원 + 쿨다운 해제. (타 유저 수신 순서와 잠시 다를 수 있음 — 허용.)
  const submit = () => {
    const body = input.trim();
    const item = pickedItem;
    if ((!body && !item) || sending || cooldown > 0) return;
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
      isMeleeChampion: mine?.isMeleeChampion ?? false,
      item: item ? { n: item.name, c: item.code, s: item.slot, e: item.e, t: item.t, cp: item.cp } : null,
      body,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, temp]);
    setInput('');
    setPickedItem(null);
    setCooldown(COOLDOWN_S);
    requestAnimationFrame(() => scrollToBottom(true));
    const rollback = () => {
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      setInput(body);
      setPickedItem(item);
      setCooldown(0);
    };
    void sendChat(body, item?.id)
      .then((r) => {
        if (r.status === 'error') {
          rollback();
          flashError(r.message);
          return;
        }
        myFieldsRef.current = r.message;
        setLatest(r.message);
        setMessages((prev) => {
          const rest = prev.filter((m) => m.id !== tempId);
          // 내 broadcast가 먼저 도착해 이미 실 메시지가 있으면 temp만 제거.
          return rest.some((m) => m.id === r.message.id) ? rest : [...rest, r.message];
        });
      })
      .catch(() => {
        rollback();
        flashError('전송에 실패했어요. 다시 시도해 주세요.');
      })
      .finally(() => setSending(false));
  };

  // 로딩 팝업 없이 — 데이터가 다 오면 그때 연다(2026-07-21 피드백 3).
  const openProfile = (userId: string) => {
    setPopupFlash(null);
    void fetch(`/api/chat/profile?uid=${userId}`, { cache: 'no-store' })
      .then(async (res) => (res.ok ? ((await res.json()) as MiniProfile) : null))
      .then((data) => {
        if (data) setProfile({ userId, data });
      })
      .catch(() => {
        /* 무시 — 팝업 미노출 */
      });
  };

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

  // 장비 선택기 — 열 때 목록 로드(세션 캐시).
  const openItemPicker = () => {
    setShowItemPicker(true);
    if (myItems === null) {
      void fetch('/api/chat/my-items', { cache: 'no-store' })
        .then(async (res) => (res.ok ? ((await res.json()) as { items: MyItem[] }) : null))
        .then((d) => setMyItems(d?.items ?? []))
        .catch(() => setMyItems([]));
    }
  };

  // 멘션 자동완성 — 입력 끝의 @접두에 대해 최근 발언자 닉 후보(최대 5).
  const mentionToken = /@([^\s@]{0,12})$/.exec(input);
  const mentionCands = mentionToken
    ? [
        ...new Set(
          [...messages]
            .reverse()
            .filter((m) => !m.sys && m.userId && m.userId !== me)
            .map((m) => m.nickname),
        ),
      ]
        .filter((n) => n.startsWith(mentionToken[1] ?? ''))
        .slice(0, 5)
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

  // 멘션 하이라이트 — @닉 토큰 앰버, 내 닉이면 진하게.
  const renderBody = (body: string) =>
    body.split(/(@[^\s@]{1,12})/g).map((part, i) =>
      part.startsWith('@') ? (
        <b
          key={i}
          className={
            meNickname && part.slice(1) === meNickname
              ? 'font-bold text-amber-600 dark:text-amber-400'
              : 'font-semibold text-amber-600/80 dark:text-amber-400/80'
          }
        >
          {part}
        </b>
      ) : (
        part
      ),
    );

  // 장비 자랑 칩 — 탭하면 상세 팝업.
  const itemChip = (it: ChatItemSnap) => (
    <button
      type="button"
      onClick={() => setItemView(it)}
      className="mt-1 flex items-center gap-1.5 rounded-lg border border-amber-200/70 bg-amber-50/60 px-2 py-1 dark:border-amber-500/20 dark:bg-amber-500/10"
    >
      <TranscendSprite code={it.c} level={it.t} slot={it.s} size={22} animate={false} frameless />
      <span className="max-w-[140px] truncate text-[11.5px] font-bold">{it.n}</span>
      <span className="text-[11.5px] font-extrabold text-amber-600 dark:text-amber-400">+{it.e}</span>
    </button>
  );

  const avatarBox = (m: { avatar: string | null; faceBox: FaceBox | null }, size: string) => (
    <span className={`${size} shrink-0 overflow-hidden`}>
      {m.avatar ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={m.avatar} alt="" className="h-full w-full" style={faceCropStyle(m.faceBox)} />
      ) : (
        <span className="flex h-full w-full items-center justify-center text-[11px]">👤</span>
      )}
    </span>
  );

  return (
    <>
      {/* 미니바 — GNB(+가이드 티커) 바로 위 fixed, 반투명(뒤 콘텐츠 비침) */}
      {!open ? (
        <div
          className="pointer-events-none fixed inset-x-0 z-20"
          style={{ bottom: 'calc(3.5rem + env(safe-area-inset-bottom) + var(--gt-h, 0px))' }}
        >
          <div className="mx-auto w-full max-w-[390px] px-2 pb-1">
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
        <div
          className="fixed inset-x-0 z-20"
          style={{
            top: 'calc(3rem + env(safe-area-inset-top))',
            // 키보드가 열리면(kbOffset>0) GNB 오프셋 대신 키보드 위로 — max()로 큰 쪽 채택.
            bottom: `max(${kbOffset}px, calc(3.5rem + env(safe-area-inset-bottom) + var(--gt-h, 0px)))`,
          }}
        >
          <div className="relative mx-auto flex h-full w-full max-w-[390px] flex-col bg-white dark:bg-zinc-950">
            <header className="flex shrink-0 items-center justify-between border-b border-zinc-100 px-3 py-1.5 dark:border-zinc-800/70">
              <h2 className="text-[12px] font-bold text-zinc-700 dark:text-zinc-200">
                💬 전체 채팅
              </h2>
              <button
                type="button"
                onClick={() => setShowBlockList(true)}
                className="text-[10.5px] font-semibold text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
              >
                차단 목록
              </button>
            </header>

            <div
              ref={listRef}
              onScroll={() => {
                const el = listRef.current;
                if (el && el.scrollHeight - el.scrollTop - el.clientHeight < 120)
                  setUnseenBelow(false);
              }}
              className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2.5 py-2"
            >
              {visibleMessages.map((m, i) => {
                // 시스템 라인(월드 이벤트) — 가운데 정렬 회색, 상호작용 없음.
                if (m.sys) {
                  return (
                    <div key={m.id} className="px-4 py-[3px] text-center text-[10.5px] leading-snug text-zinc-400 dark:text-zinc-500">
                      {worldEventMessage(m.sys, { link: false })}
                    </div>
                  );
                }
                const mine = m.userId === me;
                const pending = m.id.startsWith('tmp-');
                // 같은 유저 1분 내 연속 발언 — 아바타·닉 생략, 본문만 이어붙임(시스템 라인 사이는 미묶음).
                const prev = visibleMessages[i - 1];
                const grouped =
                  !!prev &&
                  !prev.sys &&
                  prev.userId === m.userId &&
                  new Date(m.createdAt).getTime() - new Date(prev.createdAt).getTime() < 60_000;
                if (grouped) {
                  return (
                    <div
                      key={m.id}
                      className={`flex items-start gap-2 px-1.5 py-[2px] ${
                        mine ? 'bg-amber-50/70 dark:bg-amber-500/[0.07]' : ''
                      } ${pending ? 'opacity-50' : ''}`}
                    >
                      <div className="min-w-0 flex-1 pl-8">
                        {m.body ? (
                          <p
                            onClick={() => {
                              if (!mine && !pending) setReportTarget(m);
                            }}
                            className="text-[12.5px] leading-[1.45] break-words text-zinc-800 dark:text-zinc-200"
                          >
                            {renderBody(m.body)}
                          </p>
                        ) : null}
                        {m.item ? itemChip(m.item) : null}
                      </div>
                    </div>
                  );
                }
                return (
                  <div
                    key={m.id}
                    className={`flex items-start gap-2 px-1.5 py-[5px] ${
                      mine ? 'bg-amber-50/70 dark:bg-amber-500/[0.07]' : ''
                    } ${pending ? 'opacity-50' : ''}`}
                  >
                    <button
                      type="button"
                      onClick={() => openProfile(m.userId)}
                      aria-label={`${m.nickname} 정보`}
                      className="mt-[3px]"
                    >
                      {avatarBox(m, 'block h-6 w-6')}
                    </button>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-1.5 leading-none">
                        <button
                          type="button"
                          onClick={() => openProfile(m.userId)}
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
                            className="h-3 w-3 shrink-0 self-center object-contain"
                            style={{ imageRendering: 'pixelated' }}
                          />
                        ) : null}
                        {m.guildName ? (
                          <span className="truncate text-[9.5px] text-zinc-400 dark:text-zinc-500">
                            {m.guildName}
                          </span>
                        ) : null}
                        <span className="ml-auto shrink-0 text-[9px] text-zinc-300 dark:text-zinc-600">
                          {new Date(m.createdAt).toLocaleTimeString('ko-KR', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>
                      {/* 본문 탭 = 신고 팝업(별도 신고 버튼 없음, 내 메시지 제외) */}
                      {m.body ? (
                        <p
                          onClick={() => {
                            if (!mine && !pending) setReportTarget(m);
                          }}
                          className="mt-[3px] text-[12.5px] leading-[1.45] break-words text-zinc-800 dark:text-zinc-200"
                        >
                          {renderBody(m.body)}
                        </p>
                      ) : null}
                      {m.item ? itemChip(m.item) : null}
                    </div>
                  </div>
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
              {pickedItem ? (
                <div className="mb-1.5 flex items-center gap-1.5 rounded-lg border border-amber-200/70 bg-amber-50/60 px-2 py-1 dark:border-amber-500/20 dark:bg-amber-500/10">
                  <TranscendSprite code={pickedItem.code} level={pickedItem.t} slot={pickedItem.slot} size={20} animate={false} frameless />
                  <span className="min-w-0 flex-1 truncate text-[11.5px] font-bold">
                    {pickedItem.name}{' '}
                    <b className="text-amber-600 dark:text-amber-400">+{pickedItem.e}</b>
                  </span>
                  <button
                    type="button"
                    onClick={() => setPickedItem(null)}
                    aria-label="장비 태그 제거"
                    className="shrink-0 px-1 text-[13px] leading-none text-zinc-400"
                  >
                    ×
                  </button>
                </div>
              ) : null}
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={openItemPicker}
                  aria-label="장비 자랑"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-[15px] dark:bg-zinc-800"
                >
                  ⚔️
                </button>
                <ZoomSafeInput
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.nativeEvent.isComposing) submit();
                  }}
                  maxLength={100}
                  placeholder="메시지 입력"
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
                  aria-disabled={sending || cooldown > 0 || (input.trim().length === 0 && !pickedItem)}
                  className={`h-9 w-[54px] shrink-0 rounded-full bg-amber-500 text-[12.5px] font-bold text-white ${
                    sending || cooldown > 0 || (input.trim().length === 0 && !pickedItem) ? 'opacity-40' : ''
                  }`}
                >
                  {cooldown > 0 ? `${cooldown}s` : '전송'}
                </button>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="채팅 닫기"
                  className="h-9 w-[44px] shrink-0 rounded-full bg-zinc-100 text-[12.5px] font-bold text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
                >
                  닫기
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* 미니 프로필 팝업 */}
      {profile ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="유저 정보"
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-6 backdrop-blur-sm"
          onClick={() => setProfile(null)}
        >
          <div
            className="w-full max-w-[340px] overflow-hidden rounded-2xl bg-white dark:bg-zinc-900"
            onClick={(e) => e.stopPropagation()}
          >
            {
              /* 자랑 카드식 2분할 — 왼쪽 전신 아바타(크게) / 오른쪽 정보+액션 */
              <div className="bg-gradient-to-br from-amber-50 via-white to-zinc-50 p-4 dark:from-amber-500/[0.09] dark:via-zinc-900 dark:to-zinc-900">
                {/* 닉네임·길드 — 프로필 페이지처럼 상단 가운데 별도 영역(닉 가림 방지) */}
                <div className="flex flex-col items-center text-center">
                  <b className="max-w-full truncate text-[15px] leading-tight">
                    {profile.data.isMeleeChampion ? '🏆 ' : ''}
                    {profile.data.nickname}
                  </b>
                  {profile.data.guildName ? (
                    <span className="mt-0.5 flex max-w-[88%] items-center justify-center gap-1 text-[11px] text-zinc-400">
                      {profile.data.guildEmblemUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={profile.data.guildEmblemUrl}
                          alt=""
                          className="h-3.5 w-3.5 shrink-0 object-contain"
                          style={{ imageRendering: 'pixelated' }}
                        />
                      ) : null}
                      <span className="truncate">{profile.data.guildName}</span>
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
                          ['대난투 우승', profile.data.meleeWins.toLocaleString()],
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
        </div>
      ) : null}

      {/* 장비 선택기 — 장비 자랑 태그(0127) */}
      {showItemPicker ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="장비 자랑"
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-6 backdrop-blur-sm"
          onClick={() => setShowItemPicker(false)}
        >
          <div className="w-full max-w-[300px] rounded-2xl bg-white p-4 dark:bg-zinc-900" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-[13px] font-bold">자랑할 장비 선택</h3>
            {myItems === null ? (
              <p className="py-8 text-center text-[12px] text-zinc-400">불러오는 중…</p>
            ) : myItems.length === 0 ? (
              <p className="py-8 text-center text-[12px] text-zinc-400">보유한 장비가 없어요.</p>
            ) : (
              <ul className="mt-2 max-h-[300px] space-y-1 overflow-y-auto overscroll-contain">
                {myItems.map((it) => (
                  <li key={it.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setPickedItem(it);
                        setShowItemPicker(false);
                      }}
                      className="flex w-full items-center gap-2 rounded-lg bg-zinc-50 px-2 py-1.5 text-left dark:bg-zinc-800/60"
                    >
                      <TranscendSprite code={it.code} level={it.t} slot={it.slot} size={28} animate={false} frameless />
                      <span className="min-w-0 flex-1 truncate text-[12px] font-semibold">{it.name}</span>
                      <span className="shrink-0 text-[12px] font-extrabold text-amber-600 tabular-nums dark:text-amber-400">
                        +{it.e}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <button
              type="button"
              onClick={() => setShowItemPicker(false)}
              className="mt-3 w-full rounded-lg bg-zinc-100 py-2 text-[12px] font-bold text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
            >
              닫기
            </button>
          </div>
        </div>
      ) : null}

      {/* 장비 상세 팝업 — 채팅 장비 칩 탭 */}
      {itemView ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="장비 정보"
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-6 backdrop-blur-sm"
          onClick={() => setItemView(null)}
        >
          <div className="w-full max-w-[260px] rounded-2xl bg-white p-4 text-center dark:bg-zinc-900" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-center">
              <TranscendSprite code={itemView.c} level={itemView.t} slot={itemView.s} size={96} />
            </div>
            <b className="mt-2 block text-[14px]">{itemView.n}</b>
            <div className="mt-3 space-y-1">
              {(
                [
                  ['강화', `+${itemView.e}`],
                  ['초월', itemView.t > 0 ? `${itemView.t}단계` : '—'],
                  ['전투력', itemView.cp.toLocaleString()],
                ] as const
              ).map(([label, v]) => (
                <div key={label} className="flex items-baseline justify-between gap-2 px-1">
                  <span className="text-[10px] text-zinc-400">{label}</span>
                  <span className="text-[12.5px] font-bold tabular-nums">{v}</span>
                </div>
              ))}
            </div>
            <p className="mt-2 text-[9.5px] text-zinc-400">전송 시점 기준</p>
            <button
              type="button"
              onClick={() => setItemView(null)}
              className="mt-3 w-full rounded-lg bg-zinc-100 py-2 text-[12px] font-bold text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
            >
              닫기
            </button>
          </div>
        </div>
      ) : null}

      {/* 차단 목록 팝업 — 차단 유저는 메시지가 숨어 프로필 진입이 불가하므로 여기서 해제 */}
      {showBlockList ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="차단 목록"
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-6 backdrop-blur-sm"
          onClick={() => setShowBlockList(false)}
        >
          <div
            className="w-full max-w-[280px] rounded-2xl bg-white p-4 dark:bg-zinc-900"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-[13px] font-bold">차단 목록</h3>
            {blocked.size === 0 ? (
              <p className="py-6 text-center text-[12px] text-zinc-400">차단한 유저가 없어요.</p>
            ) : (
              <ul className="mt-2 max-h-[240px] space-y-1 overflow-y-auto">
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
            <button
              type="button"
              onClick={() => setShowBlockList(false)}
              className="mt-3 w-full rounded-lg bg-zinc-100 py-2 text-[12px] font-bold text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
            >
              닫기
            </button>
          </div>
        </div>
      ) : null}

      {/* 신고 확인 팝업 */}
      {reportTarget ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="메시지 신고"
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-6 backdrop-blur-sm"
          onClick={() => setReportTarget(null)}
        >
          <div
            className="w-full max-w-[280px] rounded-2xl bg-white p-4 dark:bg-zinc-900"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-[13px] font-bold">이 메시지를 신고할까요?</h3>
            <p className="mt-2 rounded-lg bg-zinc-50 px-3 py-2 text-[12px] text-zinc-600 dark:bg-zinc-800/60 dark:text-zinc-300">
              <b>{reportTarget.nickname}</b> · {reportTarget.body.slice(0, 60)}
            </p>
            <p className="mt-2 text-[10.5px] leading-relaxed text-zinc-400">
              신고가 누적되면 메시지가 자동으로 숨겨집니다.
            </p>
            <div className="mt-3 grid grid-cols-3 gap-1.5">
              <button
                type="button"
                onClick={() => setReportTarget(null)}
                className="rounded-lg bg-zinc-100 py-2 text-[12px] font-bold text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
              >
                취소
              </button>
              <button
                type="button"
                onClick={() => {
                  const m = reportTarget;
                  if (!m) return;
                  toggleBlock(m.userId, m.nickname);
                  setReportTarget(null);
                  flashError('차단했어요. 차단 목록에서 해제할 수 있어요.');
                }}
                className="rounded-lg bg-zinc-100 py-2 text-[12px] font-bold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
              >
                차단
              </button>
              <button
                type="button"
                onClick={confirmReport}
                className="rounded-lg bg-red-500 py-2 text-[12px] font-bold text-white"
              >
                신고
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
