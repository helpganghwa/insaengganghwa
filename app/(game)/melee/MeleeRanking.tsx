'use client';

import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

import { profileHref } from '@/lib/game/profile/href';
import { meleeFaceCropStyle } from '@/components/faceCrop';
import { GuildBadge } from '@/components/GuildBadge';
import type { MeleeRankMode, MeleeRankRow } from '@/lib/game/melee/ranking';

import { meleeRankingAction } from './actions';

const MODES: [MeleeRankMode, string][] = [
  ['all', '전체'],
  ['near', '내 주변'],
  ['guild', '우리 길드'],
];

/** 컨트롤 행 높이 — 전투 탭의 속도/전체재생 행과 동일하게 고정(탭 전환 시 시프트 방지). */
export const MELEE_CONTROL_H = 'h-[38px]';

export type MeleeRankingState = ReturnType<typeof useMeleeRanking>;

/**
 * 뒤로가기 복원 캐시 — 프로필 상세로 나갔다 돌아오면 컴포넌트가 재마운트돼 목록·스크롤이 초기화된다
 * (App Router 소프트 내비게이션은 클라 상태를 보존하지 않고, 내부 스크롤 컨테이너는 자동 복원 대상도 아님).
 *
 * ⚠ 캐시 키를 (전투×모드)로만 잡으면 **메뉴로 새로 들어와도** 이전 스크롤이 복원된다 — 원치 않는 동작.
 * 그래서 history 엔트리마다 고유키(mrk)를 심고 그 키로 캐시를 묶는다. 뒤로/앞으로 이동은 같은
 * 엔트리로 돌아오므로 mrk가 남아 있어 복원되고, 새 진입은 push로 새 엔트리라 mrk가 없어 초기화된다.
 */
type RankCache = { rows: MeleeRankRow[]; myRank: number | null; scrollTop: number };
const CACHE_PREFIX = 'melee-rank:';
const cacheKey = (histKey: string, battleId: string, mode: MeleeRankMode) =>
  `${CACHE_PREFIX}${histKey}:${battleId}:${mode}`;

function readCache(key: string): RankCache | null {
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? (JSON.parse(raw) as RankCache) : null;
  } catch {
    return null; // 프라이빗 모드·파싱 실패 — 캐시 없이 정상 동작
  }
}
function writeCache(key: string, v: RankCache) {
  try {
    // 지난 엔트리의 캐시는 다시 쓰일 일이 없다 — 쌓이면 용량만 먹으므로 쓰기 전에 청소.
    const stale: string[] = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i);
      if (k?.startsWith(CACHE_PREFIX) && !k.startsWith(key.slice(0, key.lastIndexOf(':') + 1))) {
        stale.push(k);
      }
    }
    for (const k of stale) sessionStorage.removeItem(k);
    sessionStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* 용량 초과 등 — 복원만 포기 */
  }
}

/** history 엔트리 고유키 — 없으면(=새 진입) 새로 심는다. */
function stampHistoryKey(): { key: string; existed: boolean } {
  const state = (window.history.state ?? {}) as Record<string, unknown>;
  const found = state.mrk;
  if (typeof found === 'string') return { key: found, existed: true };
  const key = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  // Next 라우터가 쓰는 내부 state를 보존해야 하므로 병합 replace.
  window.history.replaceState({ ...state, mrk: key }, '');
  return { key, existed: false };
}

/**
 * 전체 순위 데이터 — 컨트롤(모드 탭)과 리스트가 떨어져 렌더되므로 상태를 훅으로 올린다.
 * 모드는 URL 쿼리(?sub=)에 실어 뒤로가기 복원이 되게 한다.
 */
export function useMeleeRanking({
  battleId,
  enabled,
  participantCount,
}: {
  battleId: string;
  enabled: boolean;
  /** 총 참가자 수 = 최하위 등수. 아래 끝 판정에 쓴다. */
  participantCount: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const searchKey = search.toString();
  const subParam = search.get('sub');
  const mode: MeleeRankMode = subParam === 'near' || subParam === 'guild' ? subParam : 'all';

  const [rows, setRows] = useState<MeleeRankRow[]>([]);
  const [myRank, setMyRank] = useState<number | null>(null);
  const [pending, startTransition] = useTransition();

  // 스크롤 컨테이너 — 위로 로드할 때 앵커 보정(prepend 시 화면이 튀지 않게).
  const scrollRef = useRef<HTMLUListElement>(null);
  const loadedFor = useRef<string | null>(null);
  const loadingRef = useRef(false);
  /** rows가 그려진 뒤 처리할 스크롤 — 'me'면 내 행으로, 숫자면 그 위치로. */
  const pendingScroll = useRef<number | 'me' | null>(null);
  /** 현재 history 엔트리 키 + 이번 마운트가 "돌아온 것"인지. */
  const histKey = useRef<string | null>(null);
  const canRestore = useRef(false);
  /** 이탈 저장 시 최신 값 참조(클로저 stale 방지) — 렌더가 아닌 효과에서 갱신한다. */
  const snapshot = useRef<{ rows: MeleeRankRow[]; myRank: number | null }>({ rows: [], myRank: null });

  useEffect(() => {
    snapshot.current = { rows, myRank };
  }, [rows, myRank]);

  // 엔트리 키 관리 — 마운트 시점의 존재 여부가 곧 "뒤로가기로 돌아왔는가"다.
  // 탭/서브탭 이동(push·replace)은 Next가 state를 갈아끼우므로 쿼리가 바뀔 때마다 다시 심는다.
  useEffect(() => {
    const { key, existed } = stampHistoryKey();
    if (histKey.current === null) canRestore.current = existed; // 최초 마운트에서만 판정
    histKey.current = key;
  }, [searchKey]);

  const first = rows[0]?.rank ?? null;
  const last = rows[rows.length - 1]?.rank ?? null;
  // 길드 탭은 등수가 불연속(필터 결과)이라 무한 스크롤 대상이 아니다.
  const paged = mode !== 'guild';
  const hasUp = paged && first != null && first > 1;
  const hasDown = paged && last != null && last < participantCount;

  useEffect(() => {
    if (!enabled || loadedFor.current === mode) return;
    loadedFor.current = mode;
    const restorable = canRestore.current;
    // 한 번 로드한 뒤부터는 같은 엔트리 안의 모드 왕복도 캐시로 되살린다.
    canRestore.current = true;
    startTransition(async () => {
      const key = histKey.current ? cacheKey(histKey.current, battleId, mode) : null;
      // 복원 우선 — 돌아온 경우 네트워크 없이 목록·스크롤을 즉시 되살린다.
      const cached = restorable && key ? readCache(key) : null;
      if (cached && cached.rows.length > 0) {
        setRows(cached.rows);
        setMyRank(cached.myRank);
        pendingScroll.current = cached.scrollTop;
        return;
      }
      const r = await meleeRankingAction({ battleId, mode });
      if (r.status !== 'success') return;
      setRows(r.rows);
      setMyRank(r.myRank);
    });
  }, [enabled, mode, battleId]);

  // 예약된 스크롤 — rows가 그려진 다음 프레임에 적용(높이 확정 후).
  useEffect(() => {
    const want = pendingScroll.current;
    if (want == null || rows.length === 0) return;
    pendingScroll.current = null;
    requestAnimationFrame(() => {
      if (want === 'me') {
        document.getElementById('melee-rank-me')?.scrollIntoView({ block: 'center' });
      } else if (scrollRef.current) {
        scrollRef.current.scrollTop = want;
      }
    });
  }, [rows]);

  // 이탈 시 저장 — 소프트 내비(프로필 이동)에서는 언마운트 정리가, 탭 종료엔 pagehide가 잡는다.
  useEffect(() => {
    if (!enabled) return;
    const save = () => {
      const snap = snapshot.current;
      if (snap.rows.length === 0 || !histKey.current) return;
      writeCache(cacheKey(histKey.current, battleId, mode), {
        rows: snap.rows,
        myRank: snap.myRank,
        scrollTop: scrollRef.current?.scrollTop ?? 0,
      });
    };
    window.addEventListener('pagehide', save);
    return () => {
      window.removeEventListener('pagehide', save);
      save();
    };
  }, [enabled, battleId, mode]);

  /** 아래/위 이어붙이기 — 위 방향은 prepend 후 scrollTop을 늘어난 높이만큼 보정. */
  const loadMore = useCallback(
    (dir: 'up' | 'down') => {
      if (loadingRef.current) return;
      if (dir === 'up' ? !hasUp : !hasDown) return;
      loadingRef.current = true;
      const el = scrollRef.current;
      const prevH = el?.scrollHeight ?? 0;
      startTransition(async () => {
        const r = await meleeRankingAction({
          battleId,
          mode,
          ...(dir === 'up' ? { beforeRank: first! } : { afterRank: last! }),
        });
        loadingRef.current = false;
        if (r.status !== 'success' || r.rows.length === 0) return;
        setRows((prev) => (dir === 'up' ? [...r.rows, ...prev] : [...prev, ...r.rows]));
        if (dir === 'up' && el) {
          // 레이아웃 반영 후 보정 — 늘어난 만큼 내려 현재 보던 행을 제자리에 둔다.
          requestAnimationFrame(() => {
            el.scrollTop += el.scrollHeight - prevH;
          });
        }
      });
    },
    [battleId, mode, first, last, hasUp, hasDown],
  );

  const selectMode = (m: MeleeRankMode) => {
    const q = new URLSearchParams(search.toString());
    if (m === 'all') q.delete('sub');
    else q.set('sub', m);
    const qs = q.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  /** 내 순위로 — 이미 로드돼 있으면 스크롤만, 아니면 내 등수 주변으로 다시 로드 후 스크롤. */
  const jumpToMe = () => {
    if (myRank == null) return;
    if (rows.some((r) => r.rank === myRank)) {
      document
        .getElementById('melee-rank-me')
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    startTransition(async () => {
      const r = await meleeRankingAction({ battleId, mode, aroundRank: myRank });
      if (r.status !== 'success') return;
      setRows(r.rows);
      pendingScroll.current = 'me';
    });
  };

  return { mode, selectMode, rows, myRank, pending, loadMore, jumpToMe, scrollRef, hasUp, hasDown };
}

/** 컨트롤 행 — 전투 탭의 속도/전체재생 자리를 대체(모드 탭 + 내 순위 점프). */
export function MeleeRankControls({ state }: { state: MeleeRankingState }) {
  const { mode, selectMode, myRank, jumpToMe } = state;
  return (
    <div className={`flex ${MELEE_CONTROL_H} items-center justify-between gap-2 px-3`}>
      <div className="flex gap-1">
        {MODES.map(([m, label]) => (
          <button
            key={m}
            type="button"
            onClick={() => selectMode(m)}
            className={`rounded-lg px-2.5 py-1 text-[10px] font-bold transition ${
              mode === m ? 'bg-zinc-700 text-zinc-50' : 'bg-zinc-900 text-zinc-400'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {myRank != null ? (
        <button
          type="button"
          onClick={jumpToMe}
          disabled={mode !== 'all'}
          className="shrink-0 rounded-lg bg-amber-600/90 px-2.5 py-1 text-[10px] font-bold text-white transition disabled:opacity-40"
        >
          내 순위 {myRank.toLocaleString()}위
        </button>
      ) : (
        <span className="text-[10px] text-zinc-500">미참가</span>
      )}
    </div>
  );
}

/**
 * 등수별 배경 틴트 — 금·은·동은 각자의 색, 그 외는 중성. 내 행은 등수와 무관하게 앰버로 강조
 * (내 위치를 찾는 게 우선). 좌→우 방향이라 우측 얼굴 아바타를 덮지 않는다.
 */
function rankTint(rank: number, isMe: boolean): string {
  if (rank === 1) return 'from-amber-400/35 via-amber-500/10';
  if (rank === 2) return 'from-slate-300/30 via-slate-300/8';
  if (rank === 3) return 'from-orange-600/30 via-orange-700/8';
  return isMe ? 'from-amber-500/25 via-amber-500/5' : 'from-zinc-400/10 via-transparent';
}
/** 등수 숫자·구분선 색 — 틴트와 같은 계열로 맞춘다. */
function rankAccent(rank: number, isMe: boolean): { text: string; line: string } {
  if (rank === 1) return { text: 'text-amber-200', line: 'bg-amber-400/60' };
  if (rank === 2) return { text: 'text-slate-100', line: 'bg-slate-300/50' };
  if (rank === 3) return { text: 'text-orange-200', line: 'bg-orange-500/55' };
  return isMe
    ? { text: 'text-amber-300', line: 'bg-amber-600/50' }
    : { text: 'text-zinc-300', line: 'bg-zinc-700/60' };
}

/** 순위 한 줄 — FINAL 카드와 같은 방식(우측 얼굴 확대 + 좌→우 그라데이션). 높이 고정(스크롤 복원). */
function Row({ r, isMe, serverId }: { r: MeleeRankRow; isMe: boolean; serverId: number }) {
  const gold = r.rank === 1;
  const medal = r.rank <= 3 ? ['🥇', '🥈', '🥉'][r.rank - 1] : null;
  const accent = rankAccent(r.rank, isMe);
  return (
    <li className="relative flex h-[56px] items-center overflow-hidden border-b border-zinc-800/70 px-3">
      {r.avatar ? (
        <div className="pointer-events-none absolute inset-y-0 right-0 w-36">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={r.avatar}
            alt=""
            aria-hidden
            className="absolute inset-0 h-full w-full"
            style={meleeFaceCropStyle(r.faceBox)}
          />
        </div>
      ) : null}
      {/* 좌→우 그라데이션 2겹 — 위층이 등수 색, 아래층이 텍스트 가독용 암막. */}
      <div
        className={`pointer-events-none absolute inset-0 bg-gradient-to-r ${rankTint(r.rank, isMe)} to-transparent`}
      />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-zinc-950 to-transparent" />

      <div className="relative z-10 flex w-full items-center gap-2.5">
        <span
          className={`w-8 shrink-0 text-center font-mono text-[14px] font-extrabold drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)] ${accent.text}`}
        >
          {medal ?? r.rank}
        </span>
        <div className={`w-px shrink-0 self-stretch ${accent.line}`} />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1">
            <Link
              prefetch={false}
              href={profileHref(r.publicCode ?? '', serverId)}
              className="truncate text-[12.5px] font-extrabold text-zinc-50 drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]"
            >
              {r.nickname}
            </Link>
            {r.guildName ? (
              <GuildBadge
                emblemUrl={r.guildEmblemUrl}
                name={r.guildName}
                size={11}
                className="min-w-0 shrink text-[9.5px] text-zinc-300 drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]"
              />
            ) : null}
            {isMe ? (
              <span className="shrink-0 rounded bg-amber-500/25 px-1 text-[8.5px] font-black text-amber-300">
                나
              </span>
            ) : null}
          </div>
          <div className="truncate text-[9.5px] text-zinc-400 drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
            공격 <b className="font-mono font-black text-zinc-200">{r.attackSuccess}</b> · 방어{' '}
            <b className="font-mono font-black text-zinc-200">{r.defenseSuccess}</b>
            {/* 탈락 정보 — 라운드와 패배 상대를 한 문장으로(별도 우측 칸 없음). */}
            {r.eliminatedRound != null ? (
              <>
                {' · '}
                <b className="font-mono font-black text-zinc-300">
                  {r.eliminatedRound.toLocaleString()}
                </b>
                <span className="text-zinc-500"> ROUND</span>
              </>
            ) : null}
            {gold ? (
              <span className="font-bold text-amber-300"> · 최후 생존</span>
            ) : r.killerNickname ? (
              <>
                {' '}
                {r.killerPublicCode ? (
                  <Link
                    prefetch={false}
                    href={profileHref(r.killerPublicCode, serverId)}
                    className="font-bold text-rose-300"
                  >
                    {r.killerNickname}
                  </Link>
                ) : (
                  <span className="font-bold text-rose-300">{r.killerNickname}</span>
                )}
                에게 패배
              </>
            ) : null}
          </div>
        </div>
      </div>
    </li>
  );
}

/** 센티넬 — 뷰포트에 들어오면 해당 방향 로드(무한 스크롤). */
function Sentinel({
  onHit,
  rootRef,
  label,
}: {
  onHit: () => void;
  rootRef: React.RefObject<HTMLUListElement | null>;
  label: string;
}) {
  const ref = useRef<HTMLLIElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // rootMargin으로 화면에 닿기 전에 미리 당겨온다(끊김 없는 스크롤).
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) onHit();
      },
      { root: rootRef.current, rootMargin: '240px 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [onHit, rootRef]);
  return (
    <li ref={ref} className="py-3 text-center text-[10.5px] text-zinc-600">
      {label}
    </li>
  );
}

/** 순위 리스트 — 컨트롤은 상단 컨트롤 행(MeleeRankControls)이 담당. */
export function MeleeRankList({
  state,
  serverId,
  myUserId,
}: {
  state: MeleeRankingState;
  serverId: number;
  myUserId: string;
}) {
  const { rows, pending, loadMore, mode, scrollRef, hasUp, hasDown } = state;
  const up = useCallback(() => loadMore('up'), [loadMore]);
  const down = useCallback(() => loadMore('down'), [loadMore]);

  return (
    <ul ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
      {hasUp ? <Sentinel onHit={up} rootRef={scrollRef} label="위쪽 순위 불러오는 중…" /> : null}
      {rows.map((r) => (
        <div key={r.userId} id={r.userId === myUserId ? 'melee-rank-me' : undefined}>
          <Row r={r} isMe={r.userId === myUserId} serverId={serverId} />
        </div>
      ))}
      {rows.length === 0 && !pending ? (
        <li className="px-4 py-10 text-center text-[12px] text-zinc-500">
          {mode === 'guild' ? '같은 길드 참가자가 없습니다.' : '순위 정보가 없습니다.'}
        </li>
      ) : null}
      {hasDown ? (
        <Sentinel onHit={down} rootRef={scrollRef} label="아래쪽 순위 불러오는 중…" />
      ) : rows.length > 0 ? (
        <li className="py-4 text-center text-[10.5px] text-zinc-600">마지막 순위입니다</li>
      ) : null}
    </ul>
  );
}
