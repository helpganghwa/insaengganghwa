'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';

import { supabaseBrowser } from '@/lib/supabase-browser';
import { faceCropStyle } from '@/components/faceCrop';
import type { ChatMessageDto } from '@/lib/game/chat/service';

import { sendChat, reportChat } from './actions';

/**
 * 전체 채팅 도크(0125, 2026-07-20 확정 UX) —
 *  - GNB 바로 위 fixed 반투명 미니바(최근 1개 메시지) → 탭하면 헤더·GNB 사이를 덮는 불투명 패널
 *  - 수신: Supabase Realtime broadcast 구독, 실패 시 15초 폴링 폴백
 *  - 전송: sendChat 서버 액션(쿨다운 5초 — 버튼 카운트다운 동기)
 *  - 미니바 높이는 --chat-dock-h로 발행 — 레이아웃 main이 하단 패딩으로 비켜섬(콘텐츠 가림 방지)
 *  - 하단 오프셋에 --gt-h(가이드 티커) 합산 — 티커가 있는 브랜치에서도 겹치지 않음
 */

const COOLDOWN_S = 5;
const DOCK_H = '42px';
// iOS는 포커스된 input 폰트가 16px 미만이면 화면을 자동 확대 — 16px로 두고 시각만 13px로 스케일.
const INPUT_SCALE = 13 / 16;

export function ChatDock() {
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

  const openRef = useRef(false);
  const wsOkRef = useRef(false);
  const listRef = useRef<HTMLDivElement | null>(null);
  const serverIdRef = useRef(1);
  openRef.current = open;

  // 튜토리얼 중엔 도크 숨김 — 코치마크·완료 모달과 시각 경합 방지.
  useEffect(() => {
    try {
      setHiddenByTutorial(Boolean(localStorage.getItem('tut_step')));
    } catch {
      /* ignore */
    }
  }, []);

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
        // 바닥 근처에서만 자동 스크롤(위로 읽는 중이면 유지).
        const el = listRef.current;
        if (el && el.scrollHeight - el.scrollTop - el.clientHeight < 120) {
          requestAnimationFrame(() => scrollToBottom(true));
        }
      }
    },
    [scrollToBottom],
  );

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

  const submit = () => {
    const body = input.trim();
    if (!body || sending || cooldown > 0) return;
    setSending(true);
    void sendChat(body)
      .then((r) => {
        if (r.status === 'error') {
          flashError(r.message);
          return;
        }
        setInput('');
        setCooldown(COOLDOWN_S);
        applyNew(r.message);
        requestAnimationFrame(() => scrollToBottom(true));
      })
      .catch(() => flashError('전송에 실패했어요. 다시 시도해 주세요.'))
      .finally(() => setSending(false));
  };

  const report = (m: ChatMessageDto) => {
    if (!window.confirm(`이 메시지를 신고할까요?\n"${m.body.slice(0, 40)}"`)) return;
    void reportChat(m.id).then((r) => {
      flashError(r.status === 'ok' ? '신고가 접수되었습니다.' : (r.message ?? '신고에 실패했습니다.'));
    });
  };

  if (!visible) return null;

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
              {latest ? (
                <span className="min-w-0 flex-1 truncate text-[11px] text-zinc-500 dark:text-zinc-400">
                  <b className="font-semibold text-zinc-700 dark:text-zinc-200">{latest.nickname}</b>
                  <span className="mx-1 opacity-60">·</span>
                  {latest.body}
                </span>
              ) : (
                <span className="flex-1 truncate text-[11px] text-zinc-400">전체 채팅에 첫 인사를 남겨보세요</span>
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
            bottom: 'calc(3.5rem + env(safe-area-inset-bottom) + var(--gt-h, 0px))',
          }}
        >
          <div className="mx-auto flex h-full w-full max-w-[390px] flex-col bg-white dark:bg-zinc-950">
            <header className="flex shrink-0 items-center justify-between border-b border-zinc-100 px-3 py-1.5 dark:border-zinc-800/70">
              <h2 className="text-[12px] font-bold text-zinc-700 dark:text-zinc-200">💬 전체 채팅</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="채팅 닫기"
                className="px-1.5 text-base leading-none text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
              >
                ×
              </button>
            </header>

            <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2.5 py-2">
              {messages.length === 0 ? (
                <p className="py-10 text-center text-[12px] text-zinc-400">
                  아직 대화가 없어요. 첫 인사를 남겨보세요!
                </p>
              ) : (
                messages.map((m) => {
                  const mine = m.userId === me;
                  return (
                    <div
                      key={m.id}
                      className={`flex items-start gap-2 rounded-lg px-1.5 py-[5px] ${
                        mine ? 'bg-amber-50/70 dark:bg-amber-500/[0.07]' : ''
                      }`}
                    >
                      <span className="mt-[3px] h-6 w-6 shrink-0 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800/80">
                        {m.avatar ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={m.avatar} alt="" className="h-full w-full" style={faceCropStyle(m.faceBox)} />
                        ) : (
                          <span className="flex h-full w-full items-center justify-center text-[11px]">👤</span>
                        )}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline gap-1.5 leading-none">
                          {m.publicCode ? (
                            <Link
                              href={`/u/${m.publicCode}?s=${serverIdRef.current}`}
                              className="truncate text-[11px] font-semibold text-zinc-500 dark:text-zinc-400"
                            >
                              {m.nickname}
                            </Link>
                          ) : (
                            <span className="truncate text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">
                              {m.nickname}
                            </span>
                          )}
                          {m.guildName ? (
                            <span className="truncate text-[9.5px] text-zinc-400 dark:text-zinc-500">{m.guildName}</span>
                          ) : null}
                          <span className="ml-auto shrink-0 text-[9px] text-zinc-300 dark:text-zinc-600">
                            {new Date(m.createdAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                          {!mine ? (
                            <button
                              type="button"
                              onClick={() => report(m)}
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
                })
              )}
            </div>

            <div className="shrink-0 border-t border-zinc-100 px-2.5 py-2 dark:border-zinc-800/70">
              {error ? <p className="mb-1 px-1 text-[11px] text-amber-600 dark:text-amber-400">{error}</p> : null}
              <div className="flex items-center gap-1.5">
                {/* iOS 포커스 확대 방지 — 16px 폰트를 스케일로 13px처럼 표시(래퍼가 실제 크기 고정). */}
                <span className="relative h-9 min-w-0 flex-1">
                  <input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.nativeEvent.isComposing) submit();
                    }}
                    maxLength={200}
                    placeholder="메시지 입력"
                    className="absolute left-0 top-0 rounded-full border border-zinc-200 bg-zinc-50 px-4 text-[16px] outline-none focus:border-amber-400 dark:border-zinc-700 dark:bg-zinc-900"
                    style={{
                      width: `${(100 / INPUT_SCALE).toFixed(2)}%`,
                      height: `${(100 / INPUT_SCALE).toFixed(2)}%`,
                      transform: `scale(${INPUT_SCALE})`,
                      transformOrigin: '0 0',
                    }}
                  />
                </span>
                <button
                  type="button"
                  onClick={submit}
                  disabled={sending || cooldown > 0 || input.trim().length === 0}
                  className="h-9 shrink-0 rounded-full bg-amber-500 px-4 text-[12.5px] font-bold text-white disabled:opacity-40"
                >
                  {cooldown > 0 ? `${cooldown}s` : '전송'}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
