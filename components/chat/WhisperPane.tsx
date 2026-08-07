'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

import { ModalShell } from '@/components/ModalShell';
import { ModalLayout, ModalButton } from '@/components/ModalLayout';
import { ZoomSafeInput } from '@/components/ui/ZoomSafeField';
import type { FaceBox } from '@/components/faceCrop';
import type { ChatMention } from '@/lib/game/chat/service';
import { searchAction } from '@/app/(game)/friends/actions';

import { avatarBox, renderMentionBody } from './mentionBody';

/**
 * 귓속말(1:1) 패널 — 채팅 도크의 '귓속말' 탭 본문. 목록 ↔ 스레드 2단을 내부 상태로 전환한다.
 *
 * 도크와의 분담: 도크는 열림/탭/실시간 구독만, 내용은 전부 여기. 도크가 threads 응답의
 * topic으로 구독한 'new' 이벤트는 registerSink로 등록한 함수로 흘러들어온다(반환 true =
 * 지금 보고 있는 스레드라 즉시 소비했다 → 도크는 탭 점을 켜지 않는다).
 *
 * 소비 API
 *  - GET  /api/chat/whisper/threads                      → { threads, topic }
 *  - GET  /api/chat/whisper/messages?peer=&before=       → { messages(오래된→최신 50), peer }
 *  - POST /api/chat/whisper/send   { peerUserId, body }  → { status, message }
 *  - POST /api/chat/whisper/read   { peerUserId, lastId } | { peerUserId, leave: true }
 */

export type WhisperMessageDto = {
  id: string;
  fromUserId: string;
  toUserId: string;
  body: string;
  mentions: ChatMention[] | null;
  createdAt: string;
};

export type WhisperPeer = {
  userId: string;
  nickname: string;
  publicCode: string | null;
  avatar: string | null;
  faceBox: FaceBox | null;
  guildName: string | null;
};

export type WhisperThread = {
  peerUserId: string;
  nickname: string;
  publicCode: string | null;
  avatar: string | null;
  faceBox: FaceBox | null;
  guildName: string | null;
  lastBody: string;
  lastFromMe: boolean;
  lastAt: string;
  unread: number;
};

export type WhisperThreadsRes = { threads: WhisperThread[]; topic: string };

/** 외부 진입(친구 목록 버튼·푸시 딥링크) — 둘 중 아는 식별자로 스레드를 연다. */
export type WhisperOpenTarget = { userId: string } | { publicCode: string };

const PAGE = 50;
const BODY_MAX = 100;
const TIME_FMT = new Intl.DateTimeFormat('ko-KR', { hour: '2-digit', minute: '2-digit' });
const DATE_FMT = new Intl.DateTimeFormat('ko-KR', {
  month: 'long',
  day: 'numeric',
  weekday: 'short',
});

/** 목록 우측 상대시각 — 방금 / N분 / N시간 / 어제 / M.D. */
function relTime(iso: string): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return '';
  const diff = Date.now() - t;
  if (diff < 60_000) return '방금';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}분`;
  const d = new Date(t);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return `${Math.floor(diff / 3_600_000)}시간`;
  const y = new Date(now.getTime() - 86_400_000);
  if (d.toDateString() === y.toDateString()) return '어제';
  return `${d.getMonth() + 1}.${d.getDate()}`;
}

function threadPeer(t: WhisperThread): WhisperPeer {
  return {
    userId: t.peerUserId,
    nickname: t.nickname,
    publicCode: t.publicCode,
    avatar: t.avatar,
    faceBox: t.faceBox,
    guildName: t.guildName,
  };
}

export function WhisperPane({
  me,
  meNickname,
  serverId,
  seed,
  blocked,
  openTarget,
  onOpenTargetConsumed,
  onThreads,
  onUnread,
  registerSink,
  onProfile,
  onToggleBlock,
  onClose,
}: {
  /** 내 userId — 말풍선 좌/우 판정. */
  me: string | null;
  meNickname: string | null;
  serverId: number;
  /** 도크가 패널 열림 시 미리 받아둔 목록 — 첫 프레임 공백 방지(그래도 마운트 시 재조회). */
  seed: WhisperThread[] | null;
  /** 도크의 차단 목록 — 차단 유저의 대화는 목록에서 숨긴다(전체 채팅과 동일 규칙). */
  blocked: Map<string, string>;
  openTarget: WhisperOpenTarget | null;
  onOpenTargetConsumed: () => void;
  onThreads: (res: WhisperThreadsRes) => void;
  onUnread: (n: number) => void;
  registerSink: (fn: ((m: WhisperMessageDto) => boolean) | null) => void;
  onProfile: (userId: string) => void;
  onToggleBlock: (userId: string, nickname: string) => void;
  onClose: () => void;
}) {
  const [threads, setThreads] = useState<WhisperThread[]>(seed ?? []);
  const [listLoading, setListLoading] = useState(seed === null);
  const [active, setActive] = useState<WhisperPeer | null>(null);
  const [msgs, setMsgs] = useState<WhisperMessageDto[]>([]);
  const [msgsLoading, setMsgsLoading] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 목록 상단 유저 검색(새 귓속말) — mention-search 후보(닉네임만).
  const [q, setQ] = useState('');
  const [cands, setCands] = useState<string[]>([]);
  const [resolving, setResolving] = useState(false);
  // 입력창 멘션 자동완성 — 전체 채팅과 동일하게 mention-search 재사용.
  const [mentionCands, setMentionCands] = useState<string[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [ask, setAsk] = useState<'report' | 'block' | 'leave' | null>(null);

  const listRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  // 장수명 콜백(실시간 싱크·fetch 응답)이 읽는 미러 — 렌더 중 대입 대신 effect로 동기화.
  const meRef = useRef<string | null>(me);
  const activeRef = useRef<WhisperPeer | null>(null);
  const threadsRef = useRef<WhisperThread[]>(seed ?? []);
  const tempSeqRef = useRef(0);
  // 스크롤 복원 — 위로 더 불러오면 이전 높이 차이만큼 되돌려 화면이 튀지 않게.
  const restoreRef = useRef<{ h: number; top: number } | null>(null);
  const needBottomRef = useRef(false);

  // 미러 동기화는 다른 effect보다 먼저 선언 — 같은 커밋에서 먼저 실행되어야 한다.
  useEffect(() => {
    meRef.current = me;
    threadsRef.current = threads;
    activeRef.current = active;
  }, [me, threads, active]);

  const errTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flashError = useCallback((msg: string) => {
    setError(msg);
    if (errTimerRef.current) clearTimeout(errTimerRef.current);
    errTimerRef.current = setTimeout(() => setError(null), 3000);
  }, []);
  useEffect(
    () => () => {
      if (errTimerRef.current) clearTimeout(errTimerRef.current);
    },
    [],
  );

  // ── 읽음 처리 — 표시된 최신 id를 1초 디바운스로 전송(스레드 이탈·언마운트 시 즉시 flush).
  const readTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const readPendRef = useRef<{ peer: string; lastId: string } | null>(null);
  const flushRead = useCallback(() => {
    if (readTimerRef.current) {
      clearTimeout(readTimerRef.current);
      readTimerRef.current = null;
    }
    const p = readPendRef.current;
    readPendRef.current = null;
    if (!p) return;
    void fetch('/api/chat/whisper/read', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ peerUserId: p.peer, lastId: p.lastId }),
      cache: 'no-store',
    }).catch(() => {
      /* 무시 — 다음 열람에서 다시 시도 */
    });
    setThreads((prev) => prev.map((t) => (t.peerUserId === p.peer ? { ...t, unread: 0 } : t)));
  }, []);
  const queueRead = useCallback(
    (peer: string, lastId: string) => {
      if (lastId.startsWith('tmp-')) return;
      readPendRef.current = { peer, lastId };
      if (readTimerRef.current) clearTimeout(readTimerRef.current);
      readTimerRef.current = setTimeout(flushRead, 1000);
    },
    [flushRead],
  );
  useEffect(() => () => flushRead(), [flushRead]);

  // ── 목록 조회.
  const loadThreads = useCallback(async () => {
    try {
      const res = await fetch('/api/chat/whisper/threads', { cache: 'no-store' });
      if (!res.ok) return;
      const d = (await res.json()) as WhisperThreadsRes;
      setThreads(d.threads ?? []);
      onThreads(d);
    } catch {
      /* 무시 — 다음 진입에서 재조회 */
    } finally {
      setListLoading(false);
    }
  }, [onThreads]);

  useEffect(() => {
    void loadThreads();
  }, [loadThreads]);

  useEffect(() => {
    onUnread(threads.reduce((s, t) => s + (t.unread || 0), 0));
  }, [threads, onUnread]);

  // ── 스레드 열기.
  const openThread = useCallback(
    (peer: WhisperPeer) => {
      flushRead();
      setMenuOpen(false);
      setActive(peer);
      activeRef.current = peer;
      setMsgs([]);
      setInput('');
      setMentionCands([]);
      setError(null);
      setHasMore(false);
      setMsgsLoading(true);
      needBottomRef.current = true;
      void fetch(`/api/chat/whisper/messages?peer=${encodeURIComponent(peer.userId)}`, {
        cache: 'no-store',
      })
        .then(async (r) =>
          r.ok ? ((await r.json()) as { messages: WhisperMessageDto[]; peer?: WhisperPeer }) : null,
        )
        .then((d) => {
          if (!d || activeRef.current?.userId !== peer.userId) return;
          setMsgs(d.messages);
          setHasMore(d.messages.length >= PAGE);
          // 서버가 준 상대 정보로 헤더 보정(친구 목록·딥링크 진입은 닉/아바타를 모를 수 있다).
          if (d.peer) setActive((cur) => (cur?.userId === d.peer!.userId ? d.peer! : cur));
          needBottomRef.current = true;
          const last = [...d.messages].reverse().find((m) => !m.id.startsWith('tmp-'));
          if (last) queueRead(peer.userId, last.id);
        })
        .catch(() => flashError('대화를 불러오지 못했어요.'))
        .finally(() => setMsgsLoading(false));
    },
    [flashError, flushRead, queueRead],
  );

  const backToList = useCallback(() => {
    flushRead();
    setMenuOpen(false);
    setActive(null);
    activeRef.current = null;
    setMsgs([]);
    setInput('');
    setMentionCands([]);
  }, [flushRead]);

  // ── 닉네임/공개코드 → userId 해석.
  // mention-search는 닉네임 문자열만 돌려주므로(userId 없음) 실제 스레드를 열려면 한 번 더
  // 해석해야 한다. 친구 찾기의 searchAction이 닉네임(부분)·공개코드(정확)를 모두 받아
  // userId·아바타까지 주므로 그대로 재사용한다(선택/딥링크 1회성 호출이라 비용 무시 가능).
  const openByTerm = useCallback(
    (term: string, match: (u: { nickname: string; publicCode: string }) => boolean) => {
      setResolving(true);
      void searchAction(term)
        .then((r) => {
          if (r.status !== 'success') {
            flashError('유저를 찾지 못했어요.');
            return;
          }
          const hit = r.results.find(match) ?? null;
          if (!hit) {
            flashError('유저를 찾지 못했어요.');
            return;
          }
          setQ('');
          setCands([]);
          openThread({
            userId: hit.userId,
            nickname: hit.nickname,
            publicCode: hit.publicCode,
            avatar: hit.profileSouth,
            faceBox: hit.faceBox ?? null,
            guildName: hit.guildName ?? null,
          });
        })
        .catch(() => flashError('유저를 찾지 못했어요.'))
        .finally(() => setResolving(false));
    },
    [flashError, openThread],
  );

  // ── 외부 진입(친구 목록 버튼 / 푸시 딥링크) — 목록에 있으면 즉시, 없으면 해석 후 연다.
  useEffect(() => {
    if (!openTarget) return;
    onOpenTargetConsumed();
    if ('userId' in openTarget) {
      const t = threadsRef.current.find((x) => x.peerUserId === openTarget.userId);
      // 첫 대화라 목록에 없으면 messages 응답의 peer가 헤더를 채운다.
      openThread(
        t
          ? threadPeer(t)
          : {
              userId: openTarget.userId,
              nickname: '…',
              publicCode: null,
              avatar: null,
              faceBox: null,
              guildName: null,
            },
      );
      return;
    }
    const code = openTarget.publicCode;
    const t = threadsRef.current.find((x) => x.publicCode === code);
    if (t) openThread(threadPeer(t));
    else openByTerm(code, (u) => u.publicCode === code);
  }, [openTarget, onOpenTargetConsumed, openThread, openByTerm]);

  // ── 실시간 수신 싱크 — 도크가 구독한 내 수신함 토픽의 'new'가 들어온다.
  const sink = useCallback(
    (m: WhisperMessageDto): boolean => {
      const meId = meRef.current;
      const peerId = m.fromUserId === meId ? m.toUserId : m.fromUserId;
      const isActive = activeRef.current?.userId === peerId;
      let known = false;
      setThreads((prev) => {
        const i = prev.findIndex((t) => t.peerUserId === peerId);
        if (i < 0) return prev;
        known = true;
        const t = prev[i]!;
        const next = [...prev];
        next.splice(i, 1);
        return [
          {
            ...t,
            lastBody: m.body,
            lastFromMe: m.fromUserId === meId,
            lastAt: m.createdAt,
            unread: isActive || m.fromUserId === meId ? 0 : t.unread + 1,
          },
          ...next,
        ];
      });
      // 처음 말 거는 상대 — 닉·아바타를 모르므로 목록을 다시 받는다.
      if (!known) void loadThreads();
      if (!isActive) return false;
      setMsgs((prev) => (prev.some((p) => p.id === m.id) ? prev : [...prev, m]));
      const el = listRef.current;
      if (el && el.scrollHeight - el.scrollTop - el.clientHeight < 120) {
        requestAnimationFrame(() => {
          const e2 = listRef.current;
          if (e2) e2.scrollTo({ top: e2.scrollHeight, behavior: 'smooth' });
        });
      }
      if (m.fromUserId !== meId) queueRead(peerId, m.id);
      return true;
    },
    [loadThreads, queueRead],
  );
  useEffect(() => {
    registerSink(sink);
    return () => registerSink(null);
  }, [registerSink, sink]);

  // ── 목록 검색바(새 귓속말) — 250ms 디바운스 prefix 검색.
  useEffect(() => {
    const term = q.trim();
    if (term.length < 1) {
      setCands([]);
      return;
    }
    const t = setTimeout(() => {
      void fetch(`/api/chat/mention-search?q=${encodeURIComponent(term)}`, { cache: 'no-store' })
        .then(async (r) => (r.ok ? ((await r.json()) as { nicknames: string[] }) : null))
        .then((d) => setCands(d?.nicknames ?? []))
        .catch(() => setCands([]));
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  // ── 입력창 멘션 자동완성 — 전체 채팅과 동일(끝의 @접두, 250ms 디바운스).
  useEffect(() => {
    const tok = /@([^\s@]{1,12})$/.exec(input);
    if (!tok) {
      setMentionCands([]);
      return;
    }
    const term = tok[1]!;
    const t = setTimeout(() => {
      void fetch(`/api/chat/mention-search?q=${encodeURIComponent(term)}`, { cache: 'no-store' })
        .then(async (r) => (r.ok ? ((await r.json()) as { nicknames: string[] }) : null))
        .then((d) => setMentionCands(d?.nicknames ?? []))
        .catch(() => setMentionCands([]));
    }, 250);
    return () => clearTimeout(t);
  }, [input]);

  const mentionToken = /@([^\s@]{0,12})$/.exec(input);
  const mentionList = mentionToken
    ? [
        ...new Set([
          ...(active && active.nickname.startsWith(mentionToken[1] ?? '') ? [active.nickname] : []),
          ...mentionCands,
        ]),
      ].slice(0, 5)
    : [];
  const applyMention = (nick: string) => {
    if (!mentionToken) return;
    setInput(input.slice(0, mentionToken.index) + '@' + nick + ' ');
    inputRef.current?.focus();
  };

  // ── 이전 대화 더 보기(위로 스크롤).
  const loadMore = useCallback(() => {
    const el = listRef.current;
    const peer = activeRef.current;
    if (!el || !peer || loadingMore || !hasMore) return;
    const oldest = msgs.find((m) => !m.id.startsWith('tmp-'));
    if (!oldest) return;
    setLoadingMore(true);
    const h = el.scrollHeight;
    const top = el.scrollTop;
    void fetch(
      `/api/chat/whisper/messages?peer=${encodeURIComponent(peer.userId)}&before=${encodeURIComponent(oldest.id)}`,
      { cache: 'no-store' },
    )
      .then(async (r) => (r.ok ? ((await r.json()) as { messages: WhisperMessageDto[] }) : null))
      .then((d) => {
        if (!d || activeRef.current?.userId !== peer.userId) return;
        if (d.messages.length === 0) {
          setHasMore(false);
          return;
        }
        setHasMore(d.messages.length >= PAGE);
        restoreRef.current = { h, top };
        setMsgs((prev) => [...d.messages.filter((m) => !prev.some((p) => p.id === m.id)), ...prev]);
      })
      .catch(() => {
        /* 무시 — 다시 스크롤하면 재시도 */
      })
      .finally(() => setLoadingMore(false));
  }, [hasMore, loadingMore, msgs]);

  // 스크롤 위치 — 더 불러오면 위치 복원, 새로 열거나 보낼 때는 바닥. 페인트 전에 처리.
  useLayoutEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const r = restoreRef.current;
    if (r) {
      restoreRef.current = null;
      el.scrollTop = el.scrollHeight - r.h + r.top;
      return;
    }
    if (needBottomRef.current && msgs.length > 0) {
      needBottomRef.current = false;
      el.scrollTop = el.scrollHeight;
    }
  }, [msgs]);

  // ── 전송(낙관 렌더) — 즉시 말풍선, 실패하면 회수 + 입력 복원.
  const submit = () => {
    const peer = active;
    const body = input.trim();
    if (!peer || !body || sending) return;
    setSending(true);
    const tempId = `tmp-w${++tempSeqRef.current}`;
    const temp: WhisperMessageDto = {
      id: tempId,
      fromUserId: me ?? 'me',
      toUserId: peer.userId,
      body,
      mentions: null,
      createdAt: new Date().toISOString(),
    };
    setMsgs((prev) => [...prev, temp]);
    setInput('');
    // 한글 IME 조합 중 전송 시 blur로 키보드가 닫히는 문제 — 제스처 콜스택 안 focus로 유지.
    inputRef.current?.focus();
    needBottomRef.current = true;
    void fetch('/api/chat/whisper/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ peerUserId: peer.userId, body }),
      cache: 'no-store',
    })
      .then(
        async (r) =>
          (await r.json()) as
            | { status: 'ok'; message: WhisperMessageDto }
            | { status: 'error'; message: string },
      )
      .then((r) => {
        if (r.status === 'error') {
          setMsgs((prev) => prev.filter((m) => m.id !== tempId));
          setInput((cur) => cur || body);
          flashError(r.message);
          return;
        }
        setMsgs((prev) => {
          const rest = prev.filter((m) => m.id !== tempId);
          return rest.some((m) => m.id === r.message.id) ? rest : [...rest, r.message];
        });
        setThreads((prev) => {
          const i = prev.findIndex((t) => t.peerUserId === peer.userId);
          const patch = {
            lastBody: body,
            lastFromMe: true,
            lastAt: r.message.createdAt,
            unread: 0,
          };
          if (i < 0) {
            return [
              {
                peerUserId: peer.userId,
                nickname: peer.nickname,
                publicCode: peer.publicCode,
                avatar: peer.avatar,
                faceBox: peer.faceBox,
                guildName: peer.guildName,
                ...patch,
              },
              ...prev,
            ];
          }
          const next = [...prev];
          const [t] = next.splice(i, 1);
          return [{ ...t!, ...patch }, ...next];
        });
      })
      .catch(() => {
        setMsgs((prev) => prev.filter((m) => m.id !== tempId));
        setInput((cur) => cur || body);
        flashError('전송에 실패했어요. 다시 시도해 주세요.');
      })
      .finally(() => setSending(false));
  };

  // ── ⋯ 메뉴 실행.
  const doBlock = () => {
    const peer = active;
    setAsk(null);
    if (!peer) return;
    onToggleBlock(peer.userId, peer.nickname);
    backToList();
  };
  const doLeave = () => {
    const peer = active;
    setAsk(null);
    if (!peer) return;
    setThreads((prev) => prev.filter((t) => t.peerUserId !== peer.userId));
    void fetch('/api/chat/whisper/read', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ peerUserId: peer.userId, leave: true }),
      cache: 'no-store',
    })
      .catch(() => {
        /* 무시 — 다음 목록 조회에서 정합 */
      })
      .finally(() => void loadThreads());
    backToList();
  };

  const visibleThreads = threads.filter((t) => !blocked.has(t.peerUserId));

  // ─────────────────────────────────────────── 목록
  if (!active) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="shrink-0 px-2.5 pt-2 pb-1">
          <div className="flex items-center gap-1.5">
            <ZoomSafeInput
              value={q}
              onChange={(e) => setQ(e.target.value)}
              maxLength={12}
              placeholder="닉네임 검색 · 새 귓속말"
              wrapClassName="h-8 min-w-0 flex-1"
              className="rounded-full border border-zinc-200 bg-zinc-50 px-3.5 outline-none focus:border-amber-400 dark:border-zinc-700 dark:bg-zinc-900"
            />
            <button
              type="button"
              onClick={onClose}
              aria-label="채팅 닫기"
              className="h-8 w-[46px] shrink-0 rounded-full bg-zinc-100 text-[11.5px] font-bold text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
            >
              닫기
            </button>
          </div>
          {error ? (
            <p className="mt-1 px-1 text-[11px] text-amber-600 dark:text-amber-400">{error}</p>
          ) : null}
          {q.trim() && cands.length > 0 ? (
            <ul className="mt-1 overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800">
              {cands.map((n) => (
                <li key={n}>
                  <button
                    type="button"
                    disabled={resolving}
                    onClick={() => openByTerm(n, (u) => u.nickname === n)}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-[12px] font-semibold active:bg-zinc-50 disabled:opacity-50 dark:active:bg-zinc-800/60"
                  >
                    <span className="truncate">{n}</span>
                    <span className="ml-auto shrink-0 text-[10px] font-medium text-amber-600 dark:text-amber-400">
                      귓속말
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-1.5 pb-2">
          {listLoading ? (
            <p className="py-10 text-center text-[12px] text-zinc-400">불러오는 중…</p>
          ) : visibleThreads.length === 0 ? (
            <p className="px-6 py-10 text-center text-[12.5px] leading-relaxed text-zinc-500 dark:text-zinc-400">
              아직 주고받은 귓속말이 없어요.
              <br />
              위에서 닉네임을 검색해 말을 걸어보세요.
            </p>
          ) : (
            <ul>
              {visibleThreads.map((t) => (
                <li key={t.peerUserId}>
                  <button
                    type="button"
                    onClick={() => openThread(threadPeer(t))}
                    className="flex w-full items-center gap-2.5 rounded-xl px-2 py-2 text-left active:bg-zinc-50 dark:active:bg-zinc-800/60"
                  >
                    {avatarBox(t, 'block h-9 w-9')}
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline gap-1.5">
                        <b className="truncate text-[12.5px]">{t.nickname}</b>
                        {t.guildName ? (
                          <span className="truncate text-[9.5px] text-zinc-400 dark:text-zinc-500">
                            {t.guildName}
                          </span>
                        ) : null}
                        <span className="ml-auto shrink-0 text-[9.5px] text-zinc-300 dark:text-zinc-600">
                          {relTime(t.lastAt)}
                        </span>
                      </span>
                      <span className="mt-[3px] flex items-center gap-1.5">
                        <span
                          className={`min-w-0 flex-1 truncate text-[11.5px] ${
                            t.unread > 0
                              ? 'font-semibold text-zinc-700 dark:text-zinc-200'
                              : 'text-zinc-400 dark:text-zinc-500'
                          }`}
                        >
                          {t.lastFromMe ? '나: ' : ''}
                          {t.lastBody}
                        </span>
                        {t.unread > 0 ? (
                          <span className="shrink-0 rounded-full bg-amber-500 px-1.5 py-[1px] text-[9.5px] font-bold text-white tabular-nums">
                            {t.unread > 99 ? '99+' : t.unread}
                          </span>
                        ) : null}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────── 스레드
  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col">
        {/* z-30 — ⋯ 메뉴와 그 바깥 닫기 레이어가 아래 메시지 목록 위에 그려지도록 헤더가
            스택 컨텍스트를 만든다(없으면 목록 영역 탭이 메뉴를 닫지 못한다). */}
        <header className="relative z-30 flex shrink-0 items-center gap-1.5 border-b border-zinc-100 px-1.5 py-1.5 dark:border-zinc-800/70">
          <button
            type="button"
            onClick={backToList}
            aria-label="대화 목록으로"
            className="h-7 w-7 shrink-0 rounded-full text-[15px] text-zinc-500 active:bg-zinc-100 dark:text-zinc-400 dark:active:bg-zinc-800"
          >
            ‹
          </button>
          <button
            type="button"
            onClick={() => onProfile(active.userId)}
            className="flex min-w-0 flex-1 items-center gap-2 text-left"
          >
            {avatarBox(active, 'block h-7 w-7')}
            <span className="flex min-w-0 items-baseline gap-1.5">
              <b className="truncate text-[12.5px]">{active.nickname}</b>
              {active.guildName ? (
                <span className="truncate text-[9.5px] text-zinc-400 dark:text-zinc-500">
                  {active.guildName}
                </span>
              ) : null}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label="대화 메뉴"
            className="h-7 w-7 shrink-0 rounded-full text-[15px] leading-none text-zinc-400 active:bg-zinc-100 dark:active:bg-zinc-800"
          >
            ⋯
          </button>
          {menuOpen ? (
            <>
              {/* 바깥 탭 닫기 — 패널 안쪽만 덮는 투명 레이어(모달이 아니므로 셸은 쓰지 않는다) */}
              <span className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} aria-hidden />
              <div className="absolute top-[38px] right-1.5 z-20 w-[124px] overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
                {(
                  [
                    ['report', '신고'],
                    ['block', blocked.has(active.userId) ? '차단 해제' : '차단'],
                    ['leave', '대화 나가기'],
                  ] as const
                ).map(([k, label]) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      setAsk(k);
                    }}
                    className="block w-full px-3 py-2 text-left text-[12px] font-semibold active:bg-zinc-50 dark:active:bg-zinc-800/60"
                  >
                    {label}
                  </button>
                ))}
              </div>
            </>
          ) : null}
        </header>

        <div
          ref={listRef}
          onScroll={() => {
            const el = listRef.current;
            if (el && el.scrollTop < 40) loadMore();
          }}
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2.5 py-2"
        >
          {msgsLoading && msgs.length === 0 ? (
            <p className="py-10 text-center text-[12px] text-zinc-400">불러오는 중…</p>
          ) : null}
          {loadingMore ? (
            <p className="py-1.5 text-center text-[10px] text-zinc-400">이전 대화 불러오는 중…</p>
          ) : null}
          {!msgsLoading && msgs.length === 0 ? (
            <p className="py-10 text-center text-[12px] leading-relaxed text-zinc-400">
              첫 귓속말을 보내보세요.
            </p>
          ) : null}
          {msgs.map((m, i) => {
            const mine = m.fromUserId === me;
            const pending = m.id.startsWith('tmp-');
            const prev = msgs[i - 1];
            const showDate =
              !prev ||
              new Date(prev.createdAt).toDateString() !== new Date(m.createdAt).toDateString();
            return (
              <div key={m.id}>
                {showDate ? (
                  <div className="my-2 flex items-center gap-2">
                    <span className="h-px flex-1 bg-zinc-100 dark:bg-zinc-800" />
                    <span className="shrink-0 text-[9.5px] text-zinc-400 dark:text-zinc-500">
                      {DATE_FMT.format(new Date(m.createdAt))}
                    </span>
                    <span className="h-px flex-1 bg-zinc-100 dark:bg-zinc-800" />
                  </div>
                ) : null}
                <div
                  className={`flex items-end gap-1 py-[2px] ${mine ? 'justify-end' : 'justify-start'}`}
                >
                  {mine ? (
                    <span className="shrink-0 text-[9px] text-zinc-300 dark:text-zinc-600">
                      {TIME_FMT.format(new Date(m.createdAt))}
                    </span>
                  ) : null}
                  <p
                    className={`max-w-[74%] rounded-2xl px-3 py-1.5 text-[12.5px] leading-[1.45] break-words ${
                      mine
                        ? 'bg-amber-500 text-white'
                        : 'bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200'
                    } ${pending ? 'opacity-50' : ''}`}
                  >
                    {renderMentionBody(m.body, m.mentions, meNickname, serverId, { invert: mine })}
                  </p>
                  {!mine ? (
                    <span className="shrink-0 text-[9px] text-zinc-300 dark:text-zinc-600">
                      {TIME_FMT.format(new Date(m.createdAt))}
                    </span>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>

        <div className="shrink-0 border-t border-zinc-100 px-2.5 py-2 dark:border-zinc-800/70">
          {error ? (
            <p className="mb-1 px-1 text-[11px] text-amber-600 dark:text-amber-400">{error}</p>
          ) : null}
          {mentionList.length > 0 ? (
            <div className="mb-1 flex flex-wrap gap-1">
              {mentionList.map((n) => (
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
              maxLength={BODY_MAX}
              placeholder="귓속말 입력 · @닉네임 멘션"
              wrapClassName="h-9 min-w-0 flex-1"
              className="rounded-full border border-zinc-200 bg-zinc-50 px-4 outline-none focus:border-amber-400 dark:border-zinc-700 dark:bg-zinc-900"
            />
            {input.length >= 80 ? (
              <span className="shrink-0 text-[10px] text-zinc-400 tabular-nums">
                {input.length}/{BODY_MAX}
              </span>
            ) : null}
            <button
              type="button"
              onClick={submit}
              onPointerDown={(e) => e.preventDefault()}
              aria-disabled={sending || input.trim().length === 0}
              className={`h-9 w-[54px] shrink-0 rounded-full bg-amber-500 text-[12.5px] font-bold text-white ${
                sending || input.trim().length === 0 ? 'opacity-40' : ''
              }`}
            >
              전송
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="채팅 닫기"
              className="h-9 w-[54px] shrink-0 rounded-full bg-zinc-100 text-[12.5px] font-bold text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
            >
              닫기
            </button>
          </div>
        </div>
      </div>

      {/* 신고 — v1은 안내만. 기존 reportChat은 chat_messages(bigint id) 전용이라 귓속말
          메시지 id로는 호출 자체가 성립하지 않는다(엉뚱한 메시지 신고 위험). 귓속말 신고
          백엔드가 생기면 여기서 바로 호출하도록 교체할 것. */}
      {ask === 'report' ? (
        <ModalShell onClose={() => setAsk(null)} label="귓속말 신고">
          <ModalLayout
            title="이 대화를 신고할까요?"
            subtitle={
              <span className="font-bold text-zinc-600 dark:text-zinc-300">{active.nickname}</span>
            }
            footer={
              <>
                <ModalButton tone="ghost" onClick={() => setAsk(null)}>
                  취소
                </ModalButton>
                <ModalButton tone="danger" onClick={() => setAsk('block')}>
                  차단하기
                </ModalButton>
              </>
            }
          >
            <p className="text-[12.5px] leading-relaxed text-zinc-600 dark:text-zinc-300">
              귓속말은 아직 앱 안에서 바로 신고할 수 없어요. 먼저 차단해 대화를 끊고, 설정 &gt;
              문의하기로 내용을 알려주세요. 확인 후 조치합니다.
            </p>
          </ModalLayout>
        </ModalShell>
      ) : null}

      {ask === 'block' ? (
        <ModalShell onClose={() => setAsk(null)} onSubmit={doBlock} label="유저 차단">
          <ModalLayout
            title={blocked.has(active.userId) ? '차단을 해제할까요?' : '이 유저를 차단할까요?'}
            subtitle={
              <span className="font-bold text-zinc-600 dark:text-zinc-300">{active.nickname}</span>
            }
            footer={
              <>
                <ModalButton tone="ghost" onClick={() => setAsk(null)}>
                  취소
                </ModalButton>
                <ModalButton tone="danger" onClick={doBlock}>
                  {blocked.has(active.userId) ? '해제' : '차단'}
                </ModalButton>
              </>
            }
          >
            <p className="text-center text-[12.5px] leading-relaxed text-zinc-500 dark:text-zinc-400">
              {blocked.has(active.userId)
                ? '다시 이 유저의 메시지가 보입니다.'
                : '이 유저의 채팅·귓속말이 보이지 않습니다. 차단 목록에서 해제할 수 있어요.'}
            </p>
          </ModalLayout>
        </ModalShell>
      ) : null}

      {ask === 'leave' ? (
        <ModalShell onClose={() => setAsk(null)} onSubmit={doLeave} label="대화 나가기">
          <ModalLayout
            title="대화를 나갈까요?"
            subtitle={
              <span className="font-bold text-zinc-600 dark:text-zinc-300">{active.nickname}</span>
            }
            footer={
              <>
                <ModalButton tone="ghost" onClick={() => setAsk(null)}>
                  취소
                </ModalButton>
                <ModalButton tone="danger" onClick={doLeave}>
                  나가기
                </ModalButton>
              </>
            }
          >
            <p className="text-center text-[12.5px] leading-relaxed text-zinc-500 dark:text-zinc-400">
              목록에서 사라집니다. 다시 귓속말을 주고받으면 대화가 새로 열려요.
            </p>
          </ModalLayout>
        </ModalShell>
      ) : null}
    </>
  );
}
