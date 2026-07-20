'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';

import { supabaseBrowser } from '@/lib/supabase-browser';
import type { ChatMessageDto } from '@/lib/game/chat/service';

import { sendChat, reportChat } from './actions';

/**
 * 월드 채팅 도크(0125, 2026-07-20 확정 UX) —
 *  - GNB 바로 위 fixed 반투명 미니바(최근 1개 메시지) → 탭하면 헤더·GNB 사이를 덮는 불투명 패널
 *  - 수신: Supabase Realtime broadcast 구독, 실패 시 15초 폴링 폴백
 *  - 전송: sendChat 서버 액션(쿨다운 5초 — 버튼 카운트다운 동기)
 */

const COOLDOWN_S = 5;

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

  if (enabled === null || enabled === false || hiddenByTutorial) return null;

  return (
    <>
      {/* 미니바 — GNB 바로 위 fixed, 반투명(뒤 콘텐츠 비침) */}
      {!open ? (
        <div
          className="pointer-events-none fixed inset-x-0 z-20"
          style={{ bottom: 'calc(3.5rem + env(safe-area-inset-bottom))' }}
        >
          <div className="mx-auto w-full max-w-[390px] px-2 pb-1">
            <button
              type="button"
              onClick={openPanel}
              aria-label="월드 채팅 열기"
              className="pointer-events-auto flex w-full items-center gap-2 rounded-full border border-zinc-200/70 bg-white/75 px-3 py-1.5 text-left backdrop-blur-md dark:border-zinc-700/70 dark:bg-zinc-900/75"
            >
              <span aria-hidden className="text-[13px]">💬</span>
              {latest ? (
                <span className="min-w-0 flex-1 truncate text-[11.5px] text-zinc-600 dark:text-zinc-300">
                  <b className="font-bold text-zinc-800 dark:text-zinc-100">{latest.nickname}</b>
                  <span className="mx-1 text-zinc-400">·</span>
                  {latest.body}
                </span>
              ) : (
                <span className="flex-1 truncate text-[11.5px] text-zinc-400">월드 채팅에 첫 인사를 남겨보세요</span>
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
            bottom: 'calc(3.5rem + env(safe-area-inset-bottom))',
          }}
        >
          <div className="mx-auto flex h-full w-full max-w-[390px] flex-col border-x border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
            <header className="flex shrink-0 items-center justify-between border-b border-zinc-200 px-3 py-2 dark:border-zinc-800">
              <h2 className="text-[13px] font-extrabold">💬 월드 채팅</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="채팅 닫기"
                className="px-1 text-lg leading-none text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
              >
                ×
              </button>
            </header>

            <div ref={listRef} className="min-h-0 flex-1 space-y-2.5 overflow-y-auto overscroll-contain px-3 py-3">
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
                      className={`flex items-start gap-2 rounded-xl px-2 py-1.5 ${
                        mine ? 'bg-amber-50 dark:bg-amber-500/10' : ''
                      }`}
                    >
                      <span className="mt-0.5 h-7 w-7 shrink-0 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                        {m.avatar ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={m.avatar}
                            alt=""
                            className="h-full w-full scale-[2.2] object-cover object-top"
                            style={{ imageRendering: 'pixelated' }}
                          />
                        ) : (
                          <span className="flex h-full w-full items-center justify-center text-[13px]">👤</span>
                        )}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline gap-1.5">
                          {m.publicCode ? (
                            <Link
                              href={`/u/${m.publicCode}?s=${serverIdRef.current}`}
                              className="truncate text-[11.5px] font-bold text-zinc-800 dark:text-zinc-100"
                            >
                              {m.nickname}
                            </Link>
                          ) : (
                            <span className="truncate text-[11.5px] font-bold text-zinc-800 dark:text-zinc-100">
                              {m.nickname}
                            </span>
                          )}
                          {m.guildName ? (
                            <span className="truncate text-[10px] text-zinc-400">{m.guildName}</span>
                          ) : null}
                          <span className="ml-auto shrink-0 text-[10px] text-zinc-400">
                            {new Date(m.createdAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <p className="break-words text-[13px] leading-snug text-zinc-700 dark:text-zinc-200">
                          {m.body}
                        </p>
                      </div>
                      {!mine ? (
                        <button
                          type="button"
                          onClick={() => report(m)}
                          aria-label="메시지 신고"
                          className="mt-0.5 shrink-0 text-[10px] text-zinc-300 hover:text-red-500 dark:text-zinc-600"
                        >
                          신고
                        </button>
                      ) : null}
                    </div>
                  );
                })
              )}
            </div>

            <div className="shrink-0 border-t border-zinc-200 px-3 py-2 dark:border-zinc-800">
              {error ? <p className="mb-1 text-[11px] text-amber-600 dark:text-amber-400">{error}</p> : null}
              <div className="flex items-center gap-2">
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.nativeEvent.isComposing) submit();
                  }}
                  maxLength={200}
                  placeholder="메시지 입력 (200자)"
                  className="min-w-0 flex-1 rounded-full border border-zinc-300 bg-white px-3.5 py-2 text-[13px] outline-none focus:border-amber-500 dark:border-zinc-700 dark:bg-zinc-900"
                />
                <button
                  type="button"
                  onClick={submit}
                  disabled={sending || cooldown > 0 || input.trim().length === 0}
                  className="shrink-0 rounded-full bg-amber-500 px-4 py-2 text-[13px] font-bold text-white disabled:opacity-40"
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
