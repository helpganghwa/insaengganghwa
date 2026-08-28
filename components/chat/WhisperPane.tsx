'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import { ModalShell } from '@/components/ModalShell';
import { ModalLayout, ModalButton } from '@/components/ModalLayout';
import { TitleTag } from '@/components/TitleTag';
import { ZoomSafeInput } from '@/components/ui/ZoomSafeField';
import type { FaceBox } from '@/components/faceCrop';
import type { ChatMention, ChatMessageDto } from '@/lib/game/chat/service';
import { CHAT_DELETED_BODY } from '@/lib/game/chat/filter';
import { searchAction } from '@/app/(game)/friends/actions';

import { deleteWhisper, reportWhisper } from './actions';
import { ChatDateDivider, ChatRow, chatDateLabel } from './ChatRow';
import { useScrollFxPause } from './useScrollFxPause';
import { avatarBox } from './mentionBody';

/**
 * 귓속말(1:1) 패널 — 채팅 도크의 '귓속말' 탭 본문. 목록 ↔ 스레드 2단을 내부 상태로 전환한다.
 *
 * 스레드 본문은 전체·길드와 **같은 행 컴포넌트**(ChatRow)로 그린다 — 말풍선 좌/우 대신 아바타·
 * 닉네임·길드 문양·길드명·칭호가 붙은 같은 줄이라, 같은 사람이 채널마다 다르게 보이지 않는다.
 * 신고 진입도 같다: 본문 탭 → 확인 팝업(내 메시지 제외).
 *
 * 도크와의 분담: 도크는 열림/탭/실시간 구독만, 내용은 전부 여기. 도크가 threads 응답의
 * topic으로 구독한 'new' 이벤트는 registerSink로 등록한 함수로 흘러들어온다(반환 true =
 * 지금 보고 있는 스레드라 즉시 소비했다 → 도크는 탭 점을 켜지 않는다).
 *
 * 소비 API
 *  - GET  /api/chat/whisper/threads                      → { threads, topic }
 *  - GET  /api/chat/whisper/messages?peer=               → { messages(오래된→최신 200), peer, self }
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
  /** 본인 삭제(0177) — 서버 DTO와 동일. */
  deleted?: boolean;
};

/** 채팅 행이 쓰는 표시 필드 묶음 — 서버 whisperDisplay()와 1:1(길드 문양·집행관·칭호 포함). */
export type WhisperDisplay = {
  nickname: string;
  publicCode: string | null;
  avatar: string | null;
  faceThumb: string | null;
  faceBox: FaceBox | null;
  guildName: string | null;
  guildEmblemUrl: string | null;
  executorZone: string | null;
  executorZoneRegion: string | null;
  repTitle: string | null;
  isMeleeChampion: boolean;
};

export type WhisperPeer = WhisperDisplay & { userId: string };

export type WhisperThread = WhisperDisplay & {
  peerUserId: string;
  lastBody: string;
  lastFromMe: boolean;
  lastAt: string;
  unread: number;
};

export type WhisperThreadsRes = { threads: WhisperThread[]; topic: string };

/** 외부 진입(친구 목록 버튼·푸시 딥링크) — 둘 중 아는 식별자로 스레드를 연다. */
export type WhisperOpenTarget = { userId: string } | { publicCode: string };

const BODY_MAX = 100;

/** 아직 신원을 모르는 상대(친구 목록·딥링크 직행) — messages 응답의 peer가 곧 덮어쓴다. */
const UNKNOWN: WhisperDisplay = {
  nickname: '…',
  publicCode: null,
  avatar: null,
  faceThumb: null,
  faceBox: null,
  guildName: null,
  guildEmblemUrl: null,
  executorZone: null,
  executorZoneRegion: null,
  repTitle: null,
  isMeleeChampion: false,
};

/** 표시 필드만 추려낸다 — 목록 행·상대 정보·낙관 삽입이 같은 묶음을 돌려쓰게. */
function pickDisplay(d: WhisperDisplay): WhisperDisplay {
  return {
    nickname: d.nickname,
    publicCode: d.publicCode,
    avatar: d.avatar,
    faceThumb: d.faceThumb,
    faceBox: d.faceBox,
    guildName: d.guildName,
    guildEmblemUrl: d.guildEmblemUrl,
    executorZone: d.executorZone,
    executorZoneRegion: d.executorZoneRegion,
    repTitle: d.repTitle,
    isMeleeChampion: d.isMeleeChampion,
  };
}

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
  return { userId: t.peerUserId, ...pickDisplay(t) };
}

export function WhisperPane({
  me,
  meNickname,
  meCode,
  serverId,
  seed,
  blocked,
  openTarget,
  onOpenTargetConsumed,
  onThreads,
  onUnread,
  registerSink,
  registerDeleteSink,
  onProfile,
  onToggleBlock,
  onClose,
}: {
  /** 내 userId — 내 행 판정(전체 채팅과 동일하게 배경 강조만 다르다). */
  me: string | null;
  meNickname: string | null;
  /** 멘션 '나 지목' 판정용 불변 코드 — 닉 재사용 오귀속 방지(이름 감사 H2). */
  meCode: string | null;
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
  /** 본인 삭제 'delete' 이벤트 싱크(0177) — 열린 스레드의 해당 행을 자리표시로. */
  registerDeleteSink: (fn: ((id: string) => void) | null) => void;
  onProfile: (userId: string) => void;
  onToggleBlock: (userId: string, nickname: string) => void;
  onClose: () => void;
}) {
  const [threads, setThreads] = useState<WhisperThread[]>(seed ?? []);
  const [listLoading, setListLoading] = useState(seed === null);
  const [active, setActive] = useState<WhisperPeer | null>(null);
  /** 내 표시 필드 — 스레드의 내 행도 채팅과 같은 모양으로 그리려면 필요(messages 응답이 준다). */
  const [self, setSelf] = useState<WhisperDisplay | null>(null);
  const [msgs, setMsgs] = useState<WhisperMessageDto[]>([]);
  const [msgsLoading, setMsgsLoading] = useState(false);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 목록 하단 유저 검색(새 귓속말) — mention-search 후보(닉네임만).
  const [q, setQ] = useState('');
  const [cands, setCands] = useState<string[]>([]);
  const [resolving, setResolving] = useState(false);
  // 입력창 멘션 자동완성 — 전체 채팅과 동일하게 mention-search 재사용.
  const [mentionCands, setMentionCands] = useState<string[]>([]);
  // ⋯ 메뉴 — 자체 드롭다운이 아니라 공용 팝업(2026-08-07). 각 항목은 아래 ask 확인 팝업으로 이어진다.
  const [menuOpen, setMenuOpen] = useState(false);
  const [ask, setAsk] = useState<'block' | 'leave' | null>(null);
  // 신고 확인 팝업 대상 — 전체 채팅과 같은 '메시지 단위' 신고(본문 탭 진입).
  const [reportTarget, setReportTarget] = useState<ChatMessageDto | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ChatMessageDto | null>(null);

  const listRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  // 스크롤 중 칭호 fx 일시정지(.chat-scrolling) — ChatDock 목록과 동일 처리.
  const fxPause = useScrollFxPause();
  // 장수명 콜백(실시간 싱크·fetch 응답)이 읽는 미러 — 렌더 중 대입 대신 effect로 동기화.
  const meRef = useRef<string | null>(me);
  const activeRef = useRef<WhisperPeer | null>(null);
  const threadsRef = useRef<WhisperThread[]>(seed ?? []);
  const tempSeqRef = useRef(0);
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

  // ── 스레드 열기. 한 번의 조회로 최신 200건 — 위로 더 불러오기는 두지 않는다(대화당 보존 500건).
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
      setMsgsLoading(true);
      needBottomRef.current = true;
      void fetch(`/api/chat/whisper/messages?peer=${encodeURIComponent(peer.userId)}`, {
        cache: 'no-store',
      })
        .then(async (r) =>
          r.ok
            ? ((await r.json()) as {
                messages: WhisperMessageDto[];
                peer?: WhisperPeer;
                self?: WhisperDisplay;
              })
            : null,
        )
        .then((d) => {
          if (!d || activeRef.current?.userId !== peer.userId) return;
          setMsgs(d.messages);
          // 서버가 준 상대 정보로 헤더 보정(친구 목록·딥링크 진입은 닉/아바타를 모를 수 있다).
          if (d.peer) setActive((cur) => (cur?.userId === d.peer!.userId ? d.peer! : cur));
          if (d.self) setSelf(d.self);
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
          // 칭호·집행관은 친구 검색이 모르는 값 — messages 응답의 peer가 곧 채운다.
          openThread({
            ...UNKNOWN,
            userId: hit.userId,
            nickname: hit.nickname,
            publicCode: hit.publicCode,
            avatar: hit.profileSouth,
            faceBox: hit.faceBox ?? null,
            guildName: hit.guildName ?? null,
            guildEmblemUrl: hit.guildEmblemUrl ?? null,
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
      openThread(t ? threadPeer(t) : { ...UNKNOWN, userId: openTarget.userId });
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

  // 본인 삭제(0177) — 실시간/낙관 공통 반영. 목록 미리보기는 재조회로 맞춘다(마지막 메시지였을 때).
  const applyDeleted = useCallback(
    (id: string) => {
      setMsgs((prev) =>
        prev.some((m) => m.id === id)
          ? prev.map((m) =>
              m.id === id && !m.deleted ? { ...m, body: CHAT_DELETED_BODY, mentions: null, deleted: true } : m,
            )
          : prev,
      );
      void loadThreads();
    },
    [loadThreads],
  );
  useEffect(() => {
    registerDeleteSink(applyDeleted);
    return () => registerDeleteSink(null);
  }, [registerDeleteSink, applyDeleted]);

  // ── 목록 검색줄(새 귓속말) — 250ms 디바운스 prefix 검색.
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

  // 스크롤 위치 — 새로 열거나 보낼 때 바닥. 페인트 전에 처리(위가 보였다 내려가는 깜빡임 방지).
  useLayoutEffect(() => {
    const el = listRef.current;
    if (!el) return;
    if (needBottomRef.current && msgs.length > 0) {
      needBottomRef.current = false;
      el.scrollTop = el.scrollHeight;
    }
  }, [msgs]);

  // ── 전송(낙관 렌더) — 즉시 내 행을 띄우고, 실패하면 회수 + 입력 복원.
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
          if (i < 0) return [{ peerUserId: peer.userId, ...pickDisplay(peer), ...patch }, ...prev];
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

  // ── ⋯ 메뉴 실행. 신고는 여기 없다 — 대상이 '대화'가 아니라 '메시지'라 본문 탭이 유일한 진입.
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

  // ── 신고 — 전체 채팅과 같은 액션 형태·같은 문구.
  const onReport = useCallback((m: ChatMessageDto) => setReportTarget(m), []);
  // 삭제 쿨다운(0177) — 전체 채팅과 같은 5초(서버 chatDelete 리밋과 짝).
  const [deleteCooldown, setDeleteCooldown] = useState(0);
  useEffect(() => {
    if (deleteCooldown <= 0) return;
    const t = setTimeout(() => setDeleteCooldown((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [deleteCooldown]);
  const onDelete = useCallback((m: ChatMessageDto) => setDeleteTarget(m), []);
  const confirmDelete = () => {
    const m = deleteTarget;
    if (!m || deleteCooldown > 0) return; // 쿨다운 중엔 팝업의 '삭제 Ns' 버튼이 비활성(Enter도 무시)
    setDeleteTarget(null);
    setDeleteCooldown(5);
    applyDeleted(m.id);
    void deleteWhisper(m.id).then((r) => {
      if (r.status !== 'ok') flashError(r.message ?? '삭제에 실패했습니다.');
    });
  };
  const confirmReport = () => {
    const m = reportTarget;
    if (!m) return;
    setReportTarget(null);
    void reportWhisper(m.id).then((r) => {
      flashError(r.status === 'ok' ? '신고가 접수되었습니다.' : (r.message ?? '신고에 실패했습니다.'));
    });
  };

  /**
   * 귓속말 메시지 → 채팅 행 DTO. 발신자에 따라 표시 필드를 골라 붙인다(내 것은 self).
   * useMemo — ChatRow는 memo라 매 입력마다 새 객체를 만들면 목록 전체가 재렌더된다.
   */
  const rows = useMemo(() => {
    const meFields: WhisperDisplay = self ?? { ...UNKNOWN, nickname: meNickname ?? '나' };
    const peerFields: WhisperDisplay = active ? pickDisplay(active) : UNKNOWN;
    const out: { dto: ChatMessageDto; prev: ChatMessageDto | undefined; date: string | null }[] = [];
    let prevAt: string | undefined;
    let prevDto: ChatMessageDto | undefined;
    for (const m of msgs) {
      const date = chatDateLabel(m.createdAt, prevAt);
      const dto: ChatMessageDto = {
        id: m.id,
        userId: m.fromUserId,
        ...(m.fromUserId === me ? meFields : peerFields),
        mentions: m.mentions,
        body: m.body,
        createdAt: m.createdAt,
        ...(m.deleted ? { deleted: true } : {}),
      };
      // 날짜 구분선을 사이에 두고는 묶지 않는다 — 구분선 아래 첫 줄은 항상 발신자를 보여준다.
      out.push({ dto, prev: date ? undefined : prevDto, date });
      prevDto = dto;
      prevAt = m.createdAt;
    }
    return out;
  }, [msgs, me, meNickname, self, active]);

  const visibleThreads = threads.filter((t) => !blocked.has(t.peerUserId));
  // 검색 후보 — 입력을 지우면 즉시 감춘다(디바운스가 취소되기 전 잔상 방지).
  const searchList = q.trim() ? cands : [];

  // ─────────────────────────────────────────── 목록
  if (!active) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-1.5 pt-2 pb-2">
          {listLoading ? (
            <p className="py-10 text-center text-[12px] text-zinc-400">불러오는 중…</p>
          ) : visibleThreads.length === 0 ? (
            <p className="px-6 py-10 text-center text-[12.5px] leading-relaxed text-zinc-500 dark:text-zinc-400">
              아직 주고받은 귓속말이 없어요.
              <br />
              아래에서 닉네임을 검색해 말을 걸어보세요.
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
                      {/* 표기 순서는 채팅 행과 동일: 닉네임 → 길드 문양 → 길드명 → 칭호. */}
                      <span className="flex items-baseline gap-1.5">
                        <b className="truncate text-[12.5px]">
                          {t.isMeleeChampion ? '🏆' : ''}
                          {t.nickname}
                        </b>
                        {t.guildEmblemUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={t.guildEmblemUrl}
                            alt=""
                            loading="lazy"
                            decoding="async"
                            className="h-3 w-3 shrink-0 self-center object-contain"
                            style={{ imageRendering: 'pixelated' }}
                          />
                        ) : null}
                        {t.guildName ? (
                          <span className="truncate text-[9.5px] text-zinc-400 dark:text-zinc-500">
                            {t.guildName}
                          </span>
                        ) : null}
                        <TitleTag
                          code={t.repTitle}
                          executorZone={t.executorZone}
                          executorZoneRegion={t.executorZoneRegion}
                          className="text-[9.5px]"
                        />
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

        {/* 검색줄 — 전체·길드 탭의 하단 채팅 입력줄과 같은 구성·자리·스타일(알약 입력 + [닫기]).
            상단에 뒀을 땐 이 탭만 입력 자리가 달라 손이 헤맸고, 하단이면 키보드 동작도 다른
            입력줄들과 자동으로 같아진다. 후보는 입력줄 **위**에 칩으로 — 멘션 자동완성과 동일. */}
        <div className="shrink-0 border-t border-zinc-100 px-2.5 py-2 dark:border-zinc-800/70">
          {error ? (
            <p className="mb-1 px-1 text-[11px] text-amber-600 dark:text-amber-400">{error}</p>
          ) : null}
          {searchList.length > 0 ? (
            <div className="mb-1 flex flex-wrap gap-1">
              {searchList.map((n) => (
                <button
                  key={n}
                  type="button"
                  // 포커스를 뺏지 않아 후보를 골라도 키보드가 유지된다(멘션 칩과 같은 규칙).
                  // disabled 속성은 pointerdown을 삼켜 입력창 포커스가 풀리므로 aria로 대체.
                  onPointerDown={(e) => e.preventDefault()}
                  aria-disabled={resolving}
                  onClick={() => {
                    if (!resolving) openByTerm(n, (u) => u.nickname === n);
                  }}
                  className={`rounded-full bg-zinc-100 px-2.5 py-1 text-[11px] font-semibold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300 ${
                    resolving ? 'opacity-40' : ''
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          ) : null}
          <div className="flex items-center gap-1.5">
            <ZoomSafeInput
              value={q}
              onChange={(e) => setQ(e.target.value)}
              maxLength={12}
              placeholder="닉네임 검색 · 새 귓속말"
              wrapClassName="h-9 min-w-0 flex-1"
              className="rounded-full border border-zinc-200 bg-zinc-50 px-4 outline-none focus:border-amber-400 dark:border-zinc-700 dark:bg-zinc-900"
            />
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
    );
  }

  // ─────────────────────────────────────────── 스레드
  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col">
        <header className="flex shrink-0 items-center gap-1.5 border-b border-zinc-100 px-1.5 py-1.5 dark:border-zinc-800/70">
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
              <b className="truncate text-[12.5px]">
                {active.isMeleeChampion ? '🏆' : ''}
                {active.nickname}
              </b>
              {active.guildEmblemUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={active.guildEmblemUrl}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  className="h-3 w-3 shrink-0 self-center object-contain"
                  style={{ imageRendering: 'pixelated' }}
                />
              ) : null}
              {active.guildName ? (
                <span className="truncate text-[9.5px] text-zinc-400 dark:text-zinc-500">
                  {active.guildName}
                </span>
              ) : null}
              <TitleTag
                code={active.repTitle}
                executorZone={active.executorZone}
                executorZoneRegion={active.executorZoneRegion}
                className="text-[9.5px]"
              />
            </span>
          </button>
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            aria-label="대화 메뉴"
            className="h-7 w-7 shrink-0 rounded-full text-[15px] leading-none text-zinc-400 active:bg-zinc-100 dark:active:bg-zinc-800"
          >
            ⋯
          </button>
        </header>

        <div
          ref={listRef}
          onScroll={() => fxPause(listRef.current)}
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2.5 py-2"
        >
          {/* 아래 정렬(2026-08-28) — 메시지가 적을 때 위에서부터 쌓여 "최신이 최상단"으로 보이던 문제. 전체 채팅처럼
              항상 바닥에 붙인다(컨테이너보다 길면 일반 스크롤). */}
          <div className="flex min-h-full flex-col justify-end">
          {msgsLoading && msgs.length === 0 ? (
            <p className="py-10 text-center text-[12px] text-zinc-400">불러오는 중…</p>
          ) : null}
          {!msgsLoading && msgs.length === 0 ? (
            <p className="py-10 text-center text-[12px] leading-relaxed text-zinc-400">
              첫 귓속말을 보내보세요.
            </p>
          ) : null}
          {rows.map((r) => (
            <div key={r.dto.id}>
              {r.date ? <ChatDateDivider label={r.date} /> : null}
              <ChatRow
                m={r.dto}
                prevMsg={r.prev}
                me={me}
                meCode={meCode}
                serverId={serverId}
                onProfile={onProfile}
                onReport={onReport}
                onDelete={onDelete}
              />
            </div>
          ))}
          </div>
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

      {/* ⋯ 대화 메뉴 — 공용 팝업(셸+레이아웃). 예전엔 헤더 아래 자체 드롭다운이었는데, 앱의
          다른 메뉴가 전부 팝업이라 이 하나만 다른 규칙이었다(바깥 탭 닫기 레이어도 자체 구현).
          선택하면 기존 확인 팝업(ask)으로 이어져 실행은 한 곳에 남는다. */}
      {menuOpen ? (
        <ModalShell onClose={() => setMenuOpen(false)} label="대화 메뉴">
          <ModalLayout
            title={active.nickname}
            footer={
              // 세로 스택 — 셋 다 대등한 선택지라 가로로 나누면 글자가 눌린다.
              <div className="flex w-full flex-col gap-2">
                <ModalButton
                  tone="neutral"
                  onClick={() => {
                    setMenuOpen(false);
                    setAsk('block');
                  }}
                >
                  {blocked.has(active.userId) ? '차단 해제' : '차단'}
                </ModalButton>
                <ModalButton
                  tone="neutral"
                  onClick={() => {
                    setMenuOpen(false);
                    setAsk('leave');
                  }}
                >
                  대화 나가기
                </ModalButton>
                <ModalButton tone="ghost" onClick={() => setMenuOpen(false)}>
                  취소
                </ModalButton>
              </div>
            }
          >
            <p className="text-center text-[12.5px] leading-relaxed text-zinc-500 dark:text-zinc-400">
              차단하면 상대의 메시지가 보이지 않고, 나가면 이 대화만 목록에서 사라져요.
            </p>
          </ModalLayout>
        </ModalShell>
      ) : null}

      {/* 본인 메시지 삭제 확인(0177) — 전체 채팅과 같은 구성. */}
      {deleteTarget ? (
        <ModalShell onClose={() => setDeleteTarget(null)} onSubmit={confirmDelete} label="메시지 삭제">
          <ModalLayout
            title="이 메시지를 삭제할까요?"
            footer={
              <>
                <ModalButton tone="ghost" onClick={() => setDeleteTarget(null)}>
                  취소
                </ModalButton>
                <ModalButton tone="danger" onClick={confirmDelete} disabled={deleteCooldown > 0}>
                  {deleteCooldown > 0 ? `삭제 ${deleteCooldown}s` : '삭제'}
                </ModalButton>
              </>
            }
          >
            <p className="rounded-lg bg-zinc-100 px-3 py-2 text-[12px] text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
              {deleteTarget.body.slice(0, 60)}
            </p>
            <p className="mt-2 text-[10.5px] leading-relaxed text-zinc-400">
              상대 화면에도 &quot;{CHAT_DELETED_BODY}&quot;만 남고 되돌릴 수 없습니다. 삭제는 5초에 한 번 가능합니다.
            </p>
          </ModalLayout>
        </ModalShell>
      ) : null}

      {/* 신고 확인 — 전체 채팅 신고 팝업과 같은 구성(제목·상대·본문 카드·[취소][차단][신고]).
          귓속말엔 신고 누적 자동 숨김이 없다(신고 가능자가 상대 1명뿐이라 어뷰징 지렛대가 된다). */}
      {reportTarget ? (
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
                    setReportTarget(null);
                    onToggleBlock(m.userId, m.nickname);
                    backToList();
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
              접수된 신고는 운영자가 대화 원본을 확인해 조치합니다.
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
