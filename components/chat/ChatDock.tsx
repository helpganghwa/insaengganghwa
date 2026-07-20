'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';

import { supabaseBrowser } from '@/lib/supabase-browser';
import { ZoomSafeInput } from '@/components/ui/ZoomSafeField';
import { faceCropStyle, type FaceBox } from '@/components/faceCrop';
import type { ChatMessageDto } from '@/lib/game/chat/service';
import { sendRequestAction } from '@/app/(game)/friends/actions';

import { sendChat, reportChat } from './actions';

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
const BLOCK_KEY = 'ig:chat-blocked';

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
  friendStatus: 'pending' | 'accepted' | null;
  isMe: boolean;
};

function loadBlocked(): Set<string> {
  try {
    const raw = localStorage.getItem(BLOCK_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
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
  const [blocked, setBlocked] = useState<Set<string>>(new Set());
  // 팝업 — 미니 프로필(로딩=userId만) / 신고 확인.
  const [profile, setProfile] = useState<{ userId: string; data: MiniProfile | null } | null>(null);
  const [reportTarget, setReportTarget] = useState<ChatMessageDto | null>(null);
  const [popupFlash, setPopupFlash] = useState<string | null>(null);
  // 위로 읽는 중 도착한 새 메시지 — "↓ 새 메시지" 칩. 바닥 근처로 오면 자동 해제.
  const [unseenBelow, setUnseenBelow] = useState(false);
  // iOS 소프트 키보드가 가리는 높이(px) — visualViewport로 측정, 패널 bottom 보정.
  const [kbOffset, setKbOffset] = useState(0);

  const openRef = useRef(false);
  const wsOkRef = useRef(false);
  const listRef = useRef<HTMLDivElement | null>(null);
  const serverIdRef = useRef(1);
  // 낙관 전송용 — 내 표시 필드(닉/아바타/길드)는 서버 응답·최근 목록의 내 메시지에서 채움.
  const myFieldsRef = useRef<ChatMessageDto | null>(null);
  const tempSeqRef = useRef(0);
  openRef.current = open;

  // 튜토리얼 중엔 도크 숨김 — 코치마크·완료 모달과 시각 경합 방지. 차단 목록도 초기 로드.
  useEffect(() => {
    try {
      setHiddenByTutorial(Boolean(localStorage.getItem('tut_step')));
    } catch {
      /* ignore */
    }
    setBlocked(loadBlocked());
  }, []);

  // 라우트 이동 → 패널 자동 최소화(2026-07-20 피드백 6).
  useEffect(() => {
    setOpen(false);
    setProfile(null);
    setReportTarget(null);
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

  const scrollToBottom = useCallback((smooth = false) => {
    const el = listRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
  }, []);

  const applyNew = useCallback(
    (m: ChatMessageDto) => {
      setLatest(m);
      if (openRef.current) {
        setMessages((prev) => {
          if (prev.some((p) => p.id === m.id)) return prev;
          const next = [...prev, m];
          return next.length > 150 ? next.slice(-150) : next;
        });
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
      if (ms && ms.length > 0) setLatest(ms[ms.length - 1]!);
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

  // 폴링 폴백 — WS 미연결일 때만(15초). 열림=100개 동기화, 닫힘=최근 1개.
  useEffect(() => {
    if (enabled === false) return;
    const t = setInterval(() => {
      if (wsOkRef.current) return;
      void fetchRecent(openRef.current ? 100 : 1).then((ms) => {
        if (!ms) return;
        if (openRef.current) setMessages(ms);
        if (ms.length > 0) setLatest(ms[ms.length - 1]!);
      });
    }, 15000);
    return () => clearInterval(t);
  }, [enabled, fetchRecent]);

  // 쿨다운 카운트다운.
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const openPanel = () => {
    setOpen(true);
    setUnseenBelow(false);
    void fetchRecent(100).then((ms) => {
      if (ms) {
        setMessages(ms);
        requestAnimationFrame(() => scrollToBottom());
      }
    });
  };

  const flashError = (msg: string) => {
    setError(msg);
    setTimeout(() => setError(null), 3000);
  };

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
      isMeleeChampion: mine?.isMeleeChampion ?? false,
      body,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, temp]);
    setInput('');
    setCooldown(COOLDOWN_S);
    requestAnimationFrame(() => scrollToBottom(true));
    const rollback = () => {
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      setInput(body);
      setCooldown(0);
    };
    void sendChat(body)
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

  const openProfile = (userId: string) => {
    setPopupFlash(null);
    setProfile({ userId, data: null });
    void fetch(`/api/chat/profile?uid=${userId}`, { cache: 'no-store' })
      .then(async (res) => (res.ok ? ((await res.json()) as MiniProfile) : null))
      .then((data) => {
        if (data) setProfile((prev) => (prev?.userId === userId ? { userId, data } : prev));
        else setProfile(null);
      })
      .catch(() => setProfile(null));
  };

  const toggleBlock = (userId: string) => {
    setBlocked((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      try {
        localStorage.setItem(BLOCK_KEY, JSON.stringify([...next]));
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  const confirmReport = () => {
    const m = reportTarget;
    if (!m) return;
    setReportTarget(null);
    void reportChat(m.id).then((r) => {
      flashError(r.status === 'ok' ? '신고가 접수되었습니다.' : (r.message ?? '신고에 실패했습니다.'));
    });
  };

  if (!visible) return null;

  const visibleMessages = messages.filter((m) => !blocked.has(m.userId));
  const visibleLatest = latest && !blocked.has(latest.userId) ? latest : null;

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
            <button
              type="button"
              onClick={openPanel}
              aria-label="전체 채팅 열기"
              className="pointer-events-auto flex h-[34px] w-full items-center gap-2 rounded-full border border-zinc-200/70 bg-white/70 px-3 text-left backdrop-blur-md dark:border-zinc-700/60 dark:bg-zinc-900/70"
            >
              <span aria-hidden className="text-[12px]">💬</span>
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
            <header className="flex shrink-0 items-center border-b border-zinc-100 px-3 py-1.5 dark:border-zinc-800/70">
              <h2 className="text-[12px] font-bold text-zinc-700 dark:text-zinc-200">💬 전체 채팅</h2>
            </header>

            <div
              ref={listRef}
              onScroll={() => {
                const el = listRef.current;
                if (el && el.scrollHeight - el.scrollTop - el.clientHeight < 120) setUnseenBelow(false);
              }}
              className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2.5 py-2"
            >
              {visibleMessages.map((m, i) => {
                const mine = m.userId === me;
                const pending = m.id.startsWith('tmp-');
                // 같은 유저 1분 내 연속 발언 — 아바타·닉 생략, 본문만 이어붙임.
                const prev = visibleMessages[i - 1];
                const grouped =
                  !!prev &&
                  prev.userId === m.userId &&
                  new Date(m.createdAt).getTime() - new Date(prev.createdAt).getTime() < 60_000;
                if (grouped) {
                  return (
                    <div
                      key={m.id}
                      className={`flex items-start gap-2 rounded-lg px-1.5 py-[2px] ${
                        mine ? 'bg-amber-50/70 dark:bg-amber-500/[0.07]' : ''
                      } ${pending ? 'opacity-50' : ''}`}
                    >
                      <p className="min-w-0 flex-1 break-words pl-8 text-[12.5px] leading-[1.45] text-zinc-800 dark:text-zinc-200">
                        {m.body}
                      </p>
                      {!mine ? (
                        <button
                          type="button"
                          onClick={() => setReportTarget(m)}
                          aria-label="메시지 신고"
                          className="mt-[3px] shrink-0 text-[9px] text-zinc-300 hover:text-red-500 dark:text-zinc-600"
                        >
                          신고
                        </button>
                      ) : null}
                    </div>
                  );
                }
                return (
                  <div
                    key={m.id}
                    className={`flex items-start gap-2 rounded-lg px-1.5 py-[5px] ${
                      mine ? 'bg-amber-50/70 dark:bg-amber-500/[0.07]' : ''
                    } ${pending ? 'opacity-50' : ''}`}
                  >
                    <button type="button" onClick={() => openProfile(m.userId)} aria-label={`${m.nickname} 정보`} className="mt-[3px]">
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
                          <span className="truncate text-[9.5px] text-zinc-400 dark:text-zinc-500">{m.guildName}</span>
                        ) : null}
                        <span className="ml-auto shrink-0 text-[9px] text-zinc-300 dark:text-zinc-600">
                          {new Date(m.createdAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                        {!mine ? (
                          <button
                            type="button"
                            onClick={() => setReportTarget(m)}
                            aria-label="메시지 신고"
                            className="shrink-0 text-[9px] text-zinc-300 hover:text-red-500 dark:text-zinc-600"
                          >
                            신고
                          </button>
                        ) : null}
                      </div>
                      <p className="mt-[3px] break-words text-[12.5px] leading-[1.45] text-zinc-800 dark:text-zinc-200">
                        {m.body}
                      </p>
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
              {error ? <p className="mb-1 px-1 text-[11px] text-amber-600 dark:text-amber-400">{error}</p> : null}
              <div className="flex items-center gap-1.5">
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
                  <span className="shrink-0 text-[10px] tabular-nums text-zinc-400">{input.length}/100</span>
                ) : null}
                <button
                  type="button"
                  onClick={submit}
                  // 포커스를 뺏지 않아 전송 후에도 키보드 유지(연속 대화).
                  onPointerDown={(e) => e.preventDefault()}
                  disabled={sending || cooldown > 0 || input.trim().length === 0}
                  className="h-9 w-[54px] shrink-0 rounded-full bg-amber-500 text-[12.5px] font-bold text-white disabled:opacity-40"
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
            className="w-full max-w-[280px] rounded-2xl bg-white p-4 text-center dark:bg-zinc-900"
            onClick={(e) => e.stopPropagation()}
          >
            {!profile.data ? (
              <p className="py-8 text-[12px] text-zinc-400">불러오는 중…</p>
            ) : (
              <>
                <div className="mx-auto h-16 w-16 overflow-hidden">
                  {profile.data.avatar ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={profile.data.avatar} alt="" className="h-full w-full" style={faceCropStyle(profile.data.faceBox)} />
                  ) : (
                    <span className="flex h-full w-full items-center justify-center text-3xl">👤</span>
                  )}
                </div>
                <div className="mt-2 flex items-center justify-center gap-1.5">
                  <b className="text-[15px]">
                    {profile.data.isMeleeChampion ? '🏆 ' : ''}
                    {profile.data.nickname}
                  </b>
                  {profile.data.guildEmblemUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={profile.data.guildEmblemUrl} alt="" className="h-3.5 w-3.5 object-contain" style={{ imageRendering: 'pixelated' }} />
                  ) : null}
                  {profile.data.guildName ? (
                    <span className="text-[11px] text-zinc-400">{profile.data.guildName}</span>
                  ) : null}
                </div>
                <div className="mt-3 grid grid-cols-3 gap-1.5 text-center">
                  {(
                    [
                      ['전투력', profile.data.combat.toLocaleString()],
                      ['최고 강화', `+${profile.data.maxEnhance}`],
                      ['합산 강화', `+${profile.data.sumEnhance.toLocaleString()}`],
                    ] as const
                  ).map(([label, v]) => (
                    <div key={label} className="rounded-lg bg-zinc-50 px-1 py-1.5 dark:bg-zinc-800/60">
                      <div className="text-[9px] text-zinc-400">{label}</div>
                      <div className="text-[12px] font-bold tabular-nums">{v}</div>
                    </div>
                  ))}
                </div>
                {popupFlash ? <p className="mt-2 text-[11px] text-amber-600 dark:text-amber-400">{popupFlash}</p> : null}
                <div className="mt-3 grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setProfile(null);
                      if (profile.data?.publicCode) router.push(`/u/${profile.data.publicCode}?s=${serverIdRef.current}`);
                    }}
                    className="rounded-lg bg-zinc-100 py-2 text-[12px] font-bold dark:bg-zinc-800"
                  >
                    프로필 보기
                  </button>
                  {!profile.data.isMe ? (
                    <button
                      type="button"
                      disabled={profile.data.friendStatus !== null}
                      onClick={() => {
                        void sendRequestAction(profile.data!.userId).then((r) => {
                          setPopupFlash(r.status === 'success' ? '친구 요청을 보냈어요' : '요청에 실패했어요');
                          if (r.status === 'success')
                            setProfile((prev) =>
                              prev?.data ? { ...prev, data: { ...prev.data, friendStatus: 'pending' } } : prev,
                            );
                        });
                      }}
                      className="rounded-lg bg-amber-500 py-2 text-[12px] font-bold text-white disabled:opacity-50"
                    >
                      {profile.data.friendStatus === 'accepted'
                        ? '친구 ✓'
                        : profile.data.friendStatus === 'pending'
                          ? '요청됨'
                          : '친구 추가'}
                    </button>
                  ) : (
                    <span />
                  )}
                  {!profile.data.isMe ? (
                    <button
                      type="button"
                      onClick={() => {
                        toggleBlock(profile.data!.userId);
                        setPopupFlash(blocked.has(profile.data!.userId) ? '차단을 해제했어요' : '이 기기에서 메시지를 숨겨요');
                      }}
                      className="rounded-lg bg-zinc-100 py-2 text-[12px] font-bold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
                    >
                      {blocked.has(profile.data.userId) ? '차단 해제' : '차단'}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => setProfile(null)}
                    className="rounded-lg bg-zinc-100 py-2 text-[12px] font-bold text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
                  >
                    닫기
                  </button>
                </div>
              </>
            )}
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
          <div className="w-full max-w-[280px] rounded-2xl bg-white p-4 dark:bg-zinc-900" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-[13px] font-bold">이 메시지를 신고할까요?</h3>
            <p className="mt-2 rounded-lg bg-zinc-50 px-3 py-2 text-[12px] text-zinc-600 dark:bg-zinc-800/60 dark:text-zinc-300">
              <b>{reportTarget.nickname}</b> · {reportTarget.body.slice(0, 60)}
            </p>
            <p className="mt-2 text-[10.5px] leading-relaxed text-zinc-400">
              신고가 누적되면 메시지가 자동으로 숨겨지고 운영자가 확인합니다.
            </p>
            <div className="mt-3 grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => setReportTarget(null)}
                className="rounded-lg bg-zinc-100 py-2 text-[12px] font-bold text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
              >
                취소
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
