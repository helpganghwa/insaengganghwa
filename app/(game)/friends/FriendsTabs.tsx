'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { useResourceToast } from '@/components/ResourceToast';

import {
  searchAction,
  sendRequestAction,
  respondAction,
  cancelAction,
  removeFriendAction,
} from './actions';
import type { FriendUser, FriendRelation } from '@/lib/game/friends';

/**
 * 친구 — 목록 / 요청(받은·보낸) / 찾기. 선물 없음.
 * 변경(요청·수락·삭제) 후 router.refresh()로 서버 상태 동기화.
 */
type Tab = 'list' | 'requests' | 'find';
type SearchRow = FriendUser & { relation: FriendRelation };

const ERR: Record<string, string> = {
  SELF: '본인은 추가할 수 없습니다',
  NOT_FOUND: '유저를 찾을 수 없습니다',
  ALREADY_FRIEND: '이미 친구입니다',
  ALREADY_REQUESTED: '이미 요청했습니다',
  CAP_REACHED: '친구가 가득 찼습니다 (최대 100)',
  NO_REQUEST: '요청이 없습니다',
  UNAUTHENTICATED: '로그인이 필요합니다',
  UNKNOWN: '잠시 후 다시 시도해주세요',
};

function Avatar({ src }: { src: string | null }) {
  return (
    <div className="h-10 w-10 shrink-0 overflow-hidden rounded-full border border-zinc-700 bg-zinc-800">
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          aria-hidden
          draggable={false}
          className="h-full w-full object-cover"
          style={{ imageRendering: 'pixelated' }}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-zinc-500">👤</div>
      )}
    </div>
  );
}

function Row({
  u,
  right,
}: {
  u: FriendUser;
  right: React.ReactNode;
}) {
  return (
    <li className="flex items-center gap-3 rounded-xl border border-zinc-200 bg-white px-3 py-2.5 dark:border-zinc-800 dark:bg-zinc-950">
      <Avatar src={u.profileSouth} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-bold">{u.nickname}</div>
        <div className="truncate font-mono text-[11px] text-zinc-500">#{u.publicCode}</div>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">{right}</div>
    </li>
  );
}

const btn =
  'rounded-lg px-2.5 py-1.5 text-[12px] font-bold transition active:scale-95 disabled:opacity-50';

export function FriendsTabs({
  friends,
  incoming,
  outgoing,
}: {
  friends: FriendUser[];
  incoming: FriendUser[];
  outgoing: FriendUser[];
}) {
  const router = useRouter();
  const { showHeaderToast } = useResourceToast();
  const [tab, setTab] = useState<Tab>('list');
  const [, startTransition] = useTransition();
  const [q, setQ] = useState('');
  const [results, setResults] = useState<SearchRow[] | null>(null);
  const [busy, setBusy] = useState(false);

  const toast = (t: string, icon = '👥') => showHeaderToast({ icon, title: t });

  const doSearch = () => {
    const term = q.trim();
    if (!term) {
      setResults(null);
      return;
    }
    setBusy(true);
    startTransition(async () => {
      const r = await searchAction(term);
      setBusy(false);
      if (r.status === 'success') setResults(r.results);
      else toast(ERR[r.code] ?? ERR.UNKNOWN, '⚠️');
    });
  };

  const run = (
    fn: () => Promise<{ status: string; code?: string; result?: string }>,
    okMsg: string,
  ) => {
    setBusy(true);
    startTransition(async () => {
      const r = await fn();
      setBusy(false);
      if (r.status === 'success') {
        toast(r.result === 'accepted' ? '친구가 되었습니다' : okMsg);
        router.refresh();
        if (results) doSearch();
      } else {
        toast(ERR[r.code ?? 'UNKNOWN'] ?? ERR.UNKNOWN, '⚠️');
      }
    });
  };

  const TABS: { key: Tab; label: string; dot?: number }[] = [
    { key: 'list', label: `목록 ${friends.length}` },
    { key: 'requests', label: '요청', dot: incoming.length },
    { key: 'find', label: '찾기' },
  ];

  return (
    <div className="flex h-full flex-col px-4 py-4">
      <h1 className="mb-3 text-lg font-extrabold">친구</h1>

      {/* 탭 */}
      <div className="mb-3 flex gap-1 rounded-xl bg-zinc-100 p-1 dark:bg-zinc-900">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`relative flex-1 rounded-lg py-1.5 text-[12px] font-bold transition ${
              tab === t.key
                ? 'bg-white text-zinc-900 shadow-sm dark:bg-zinc-700 dark:text-white'
                : 'text-zinc-500'
            }`}
          >
            {t.label}
            {t.dot ? (
              <span className="absolute right-1.5 top-1 inline-flex min-w-[16px] items-center justify-center rounded-full bg-red-600 px-1 text-[9px] font-bold text-white tabular-nums">
                {t.dot}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {tab === 'list' ? (
          friends.length === 0 ? (
            <Empty text="아직 친구가 없어요. '찾기'에서 추가해보세요." />
          ) : (
            <ul className="space-y-2">
              {friends.map((u) => (
                <Row
                  key={u.userId}
                  u={u}
                  right={
                    <>
                      <Link
                        href={`/u/${encodeURIComponent(u.publicCode)}`}
                        className={`${btn} bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200`}
                      >
                        자랑
                      </Link>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => run(() => removeFriendAction(u.userId), '친구를 삭제했어요')}
                        className={`${btn} bg-zinc-100 text-zinc-500 dark:bg-zinc-800`}
                      >
                        삭제
                      </button>
                    </>
                  }
                />
              ))}
            </ul>
          )
        ) : null}

        {tab === 'requests' ? (
          <div className="space-y-4">
            <section>
              <h2 className="mb-1.5 text-[12px] font-bold text-zinc-500">받은 요청 {incoming.length}</h2>
              {incoming.length === 0 ? (
                <Empty text="받은 요청이 없어요." />
              ) : (
                <ul className="space-y-2">
                  {incoming.map((u) => (
                    <Row
                      key={u.userId}
                      u={u}
                      right={
                        <>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => run(() => respondAction(u.userId, 'accept'), '친구가 되었습니다')}
                            className={`${btn} bg-emerald-500 text-white`}
                          >
                            수락
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => run(() => respondAction(u.userId, 'decline'), '요청을 거절했어요')}
                            className={`${btn} bg-zinc-100 text-zinc-500 dark:bg-zinc-800`}
                          >
                            거절
                          </button>
                        </>
                      }
                    />
                  ))}
                </ul>
              )}
            </section>
            <section>
              <h2 className="mb-1.5 text-[12px] font-bold text-zinc-500">보낸 요청 {outgoing.length}</h2>
              {outgoing.length === 0 ? (
                <Empty text="보낸 요청이 없어요." />
              ) : (
                <ul className="space-y-2">
                  {outgoing.map((u) => (
                    <Row
                      key={u.userId}
                      u={u}
                      right={
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => run(() => cancelAction(u.userId), '요청을 취소했어요')}
                          className={`${btn} bg-zinc-100 text-zinc-500 dark:bg-zinc-800`}
                        >
                          취소
                        </button>
                      }
                    />
                  ))}
                </ul>
              )}
            </section>
          </div>
        ) : null}

        {tab === 'find' ? (
          <div className="space-y-3">
            <div className="flex gap-2">
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && doSearch()}
                placeholder="닉네임 또는 코드 검색"
                className="min-w-0 flex-1 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-amber-400 dark:border-zinc-700 dark:bg-zinc-900"
              />
              <button
                type="button"
                disabled={busy}
                onClick={doSearch}
                className={`${btn} bg-amber-500 px-3.5 text-white`}
              >
                검색
              </button>
            </div>
            {results === null ? (
              <Empty text="닉네임이나 코드로 친구를 찾아보세요." />
            ) : results.length === 0 ? (
              <Empty text="검색 결과가 없어요." />
            ) : (
              <ul className="space-y-2">
                {results.map((u) => (
                  <Row
                    key={u.userId}
                    u={u}
                    right={
                      u.relation === 'friend' ? (
                        <span className="text-[12px] font-bold text-emerald-500">친구</span>
                      ) : u.relation === 'outgoing' ? (
                        <span className="text-[12px] font-medium text-zinc-400">요청됨</span>
                      ) : u.relation === 'incoming' ? (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => run(() => respondAction(u.userId, 'accept'), '친구가 되었습니다')}
                          className={`${btn} bg-emerald-500 text-white`}
                        >
                          수락
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => run(() => sendRequestAction(u.userId), '요청을 보냈어요')}
                          className={`${btn} bg-amber-500 text-white`}
                        >
                          친구 추가
                        </button>
                      )
                    }
                  />
                ))}
              </ul>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="px-1 py-8 text-center text-[13px] text-zinc-500">{text}</p>;
}
