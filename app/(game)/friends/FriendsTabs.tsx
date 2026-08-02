'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { profileHref } from '@/lib/game/profile/href';

import { ModalShell } from '@/components/ModalShell';
import { ModalLayout, ModalButton } from '@/components/ModalLayout';
import { useResourceToast } from '@/components/ResourceToast';
import { GuildBadge } from '@/components/GuildBadge';
import { LastSeen } from '@/components/LastSeen';
import { Avatar } from './Avatar';
import { ZoomSafeInput } from '@/components/ui/ZoomSafeField';
import { Tabs, type TabItem } from '@/components/ui/Tabs';
import { PageHeader } from '@/components/ui/PageHeader';

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
 * 낙관적 UI: 목록을 로컬 상태로 두고 액션 즉시 반영, 실패 시 복원(로컬 상태가 권위).
 * 외부 배지(바텀네비/me)는 서버 액션의 revalidate가 (game)/layout을 재렌더하며 갱신하므로
 * 성공 경로 router.refresh()는 불필요(중복 GET RSC 제거, CLAUDE §11.7). 2026-07-23.
 */
type Tab = 'list' | 'requests' | 'find';
type SearchRow = FriendUser & { relation: FriendRelation };

const ERR: Record<string, string> = {
  SELF: '본인은 추가할 수 없습니다',
  NOT_FOUND: '유저를 찾을 수 없습니다',
  ALREADY_FRIEND: '이미 친구입니다',
  ALREADY_REQUESTED: '이미 요청했습니다',
  CAP_REACHED: '친구가 가득 찼습니다 (최대 30)',
  NO_REQUEST: '요청이 없어요',
  UNAUTHENTICATED: '로그인이 필요합니다',
  RATE_LIMITED: '요청이 너무 빠릅니다. 잠시 후 다시 시도해주세요',
  UNKNOWN: '잠시 후 다시 시도해주세요',
};

// 헤더와 동일 — 영역(테두리/배경) 없이 스프라이트를 확대해 상반신만 노출.

// 카드 클릭 → 프로필 상세(/u/code). 우측 버튼은 전파 차단.
// showSeen: 접속 상태 배지 노출(목록 탭만 — 요청/찾기는 미노출).
function Row({
  u,
  onOpen,
  right,
  showSeen = false,
}: {
  u: FriendUser;
  onOpen: () => void;
  right: React.ReactNode;
  showSeen?: boolean;
}) {
  return (
    <li>
      {/* 한 줄 밀도 — 종전엔 닉네임과 길드를 2줄로 써 한 화면에 6명뿐이었다. 길드를 같은 줄로
          옮기고 접속 표시를 우측으로 보내 10명이 들어온다(2026-08-02). */}
      <div
        role="button"
        tabIndex={0}
        onClick={onOpen}
        className="flex cursor-pointer items-center gap-2.5 rounded-xl border border-zinc-200 bg-white px-2.5 py-1.5 transition active:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:active:bg-zinc-900"
      >
        <Avatar src={u.profileSouth} box={u.faceBox} size="h-9 w-9" />
        <span className="flex min-w-0 flex-1 items-baseline gap-1.5">
          <span className="truncate text-[13px] font-bold">{u.nickname}</span>
          <GuildBadge
            emblemUrl={u.guildEmblemUrl ?? null}
            name={u.guildName ?? null}
            size={11}
            className="min-w-0 text-[10px] font-medium text-zinc-400"
          />
        </span>
        {showSeen && (
          <LastSeen at={u.lastSeenAt ?? null} plain className="shrink-0 text-[10px] text-zinc-400" />
        )}
        <div className="flex shrink-0 items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
          {right}
        </div>
      </div>
    </li>
  );
}

const btn =
  'rounded-lg px-2.5 py-1.5 text-[12px] font-bold transition active:scale-95 disabled:opacity-50';

export function FriendsTabs({
  friends: initFriends,
  incoming: initIncoming,
  outgoing: initOutgoing,
  serverId,
}: {
  friends: FriendUser[];
  incoming: FriendUser[];
  outgoing: FriendUser[];
  serverId: number;
}) {
  const router = useRouter(); // router.push(프로필 이동)용 — refresh는 §11.7로 제거됨
  const { showHeaderToast } = useResourceToast();
  const [tab, setTab] = useState<Tab>('list');
  const [, startTransition] = useTransition();
  const [q, setQ] = useState('');
  const [results, setResults] = useState<SearchRow[] | null>(null);
  // 검색(네트워크 조회) 전용 로딩. 목록 액션은 낙관적 반영이라 별도 pending 불필요.
  const [searching, setSearching] = useState(false);

  // 낙관적 로컬 상태(권위) — 마운트 후 서버 props는 무시(로컬이 즉시 반영분).
  const [friends, setFriends] = useState(initFriends);
  const [incoming, setIncoming] = useState(initIncoming);
  const [outgoing, setOutgoing] = useState(initOutgoing);

  // 접속 최신순 — 친구의 주 용도가 레이드 초대·같이 하기라 '지금 있는 사람'이 위에 와야 한다.
  // 기록이 없으면 뒤로(2026-08-02).
  const sortedFriends = [...friends].sort(
    (a, b) =>
      (b.lastSeenAt ? Date.parse(b.lastSeenAt) : 0) - (a.lastSeenAt ? Date.parse(a.lastSeenAt) : 0),
  );
  /** 최근 5분 내 활동 = 접속 중(헤더 표시용). */
  const onlineCount = friends.filter(
    (u) => u.lastSeenAt && Date.now() - Date.parse(u.lastSeenAt) < 5 * 60_000,
  ).length;

  const toast = (t: string) => showHeaderToast({ title: t });
  const fail = (code?: string) => toast(ERR[code ?? 'UNKNOWN'] ?? ERR.UNKNOWN);
  const setRel = (id: string, relation: FriendRelation) =>
    setResults((prev) => prev?.map((x) => (x.userId === id ? { ...x, relation } : x)) ?? prev);
  const openProfile = (u: FriendUser) => router.push(profileHref(u.publicCode, serverId));

  const doSearch = () => {
    const term = q.trim();
    if (!term) {
      setResults(null);
      return;
    }
    setSearching(true);
    startTransition(async () => {
      const r = await searchAction(term);
      setSearching(false);
      if (r.status === 'success') setResults(r.results);
      else fail(r.code);
    });
  };

  // 요청 보내기(검색) — 낙관적: none→outgoing, 목록에도 추가. 실패 시 복원.
  const send = (u: FriendUser) => {
    setRel(u.userId, 'outgoing');
    setOutgoing((p) => [u, ...p]);
    startTransition(async () => {
      const r = await sendRequestAction(u.userId);
      if (r.status === 'success') {
        if (r.result === 'accepted') {
          setRel(u.userId, 'friend');
          setOutgoing((p) => p.filter((x) => x.userId !== u.userId));
          setFriends((p) => [u, ...p]);
          toast('친구가 되었습니다');
        } else toast('요청을 보냈어요');
      } else {
        setRel(u.userId, 'none');
        setOutgoing((p) => p.filter((x) => x.userId !== u.userId));
        fail(r.code);
      }
    });
  };

  // 수락 — 낙관적: incoming 제거 + friends 추가(+검색행 friend). 실패 시 복원.
  const accept = (u: FriendUser, fromSearch = false) => {
    setIncoming((p) => p.filter((x) => x.userId !== u.userId));
    setFriends((p) => [u, ...p]);
    if (fromSearch) setRel(u.userId, 'friend');
    startTransition(async () => {
      const r = await respondAction(u.userId, 'accept');
      if (r.status === 'success') {
        toast('친구가 되었습니다');
      } else {
        setFriends((p) => p.filter((x) => x.userId !== u.userId));
        setIncoming((p) => [u, ...p]);
        if (fromSearch) setRel(u.userId, 'incoming');
        fail(r.code);
      }
    });
  };

  const decline = (u: FriendUser) => {
    setIncoming((p) => p.filter((x) => x.userId !== u.userId));
    startTransition(async () => {
      const r = await respondAction(u.userId, 'decline');
      if (r.status === 'success') {
        toast('요청을 거절했어요');
      } else {
        setIncoming((p) => [u, ...p]);
        fail(r.code);
      }
    });
  };

  const cancel = (u: FriendUser) => {
    setOutgoing((p) => p.filter((x) => x.userId !== u.userId));
    setRel(u.userId, 'none');
    startTransition(async () => {
      const r = await cancelAction(u.userId);
      if (r.status === 'success') {
        toast('요청을 취소했어요');
      } else {
        setOutgoing((p) => [u, ...p]);
        setRel(u.userId, 'outgoing');
        fail(r.code);
      }
    });
  };

  /** 친구 삭제 — 앱에서 유일하게 확인 없이 지워지던 동작이라 확인 팝업을 거친다(2026-07-29 점검). */
  const [unfriendAsk, setUnfriendAsk] = useState<FriendUser | null>(null);

  const unfriend = (u: FriendUser) => {
    setUnfriendAsk(null);
    setFriends((p) => p.filter((x) => x.userId !== u.userId));
    setRel(u.userId, 'none');
    startTransition(async () => {
      const r = await removeFriendAction(u.userId);
      if (r.status === 'success') {
        toast('친구를 삭제했어요');
      } else {
        setFriends((p) => [u, ...p]);
        setRel(u.userId, 'friend');
        fail(r.code);
      }
    });
  };

  // 목록 개수는 정보성(회색 숫자), 받은 요청은 주목 대상(붉은 배지) — 성격을 구분해 표기한다.
  const TABS: TabItem<Tab>[] = [
    { key: 'list', label: '목록', count: friends.length },
    { key: 'requests', label: '요청', badge: incoming.length },
    { key: 'find', label: '찾기' },
  ];

  return (
    <div className="flex h-[calc(100%-var(--chat-dock-h,0px))] flex-col px-4 pb-4 pt-3">
      <PageHeader
        title="친구"
        fallback="/me"
        kicker={onlineCount > 0 ? `접속 중 ${onlineCount}명` : undefined}
      />
      <div className="h-3" aria-hidden />

      <Tabs className="mb-3" items={TABS} value={tab} onChange={setTab} />

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {tab === 'list' ? (
          friends.length === 0 ? (
            <Empty text="아직 친구가 없어요. '찾기'에서 추가해보세요." />
          ) : (
            <ul className="space-y-1.5">
              {sortedFriends.map((u) => (
                <Row
                  key={u.userId}
                  u={u}
                  onOpen={() => openProfile(u)}
                  showSeen
                  right={
                    <button
                      type="button"
                      disabled={searching}
                      onClick={() => setUnfriendAsk(u)}
                      className={`${btn} bg-zinc-100 text-zinc-500 dark:bg-zinc-800`}
                    >
                      삭제
                    </button>
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
                      onOpen={() => openProfile(u)}
                      right={
                        <>
                          <button
                            type="button"
                            disabled={searching}
                            onClick={() => accept(u)}
                            className={`${btn} bg-emerald-500 text-white`}
                          >
                            수락
                          </button>
                          <button
                            type="button"
                            disabled={searching}
                            onClick={() => decline(u)}
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
                      onOpen={() => openProfile(u)}
                      right={
                        <button
                          type="button"
                          disabled={searching}
                          onClick={() => cancel(u)}
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
              <ZoomSafeInput
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && doSearch()}
                placeholder="닉네임 또는 코드 검색"
                wrapClassName="h-9 min-w-0 flex-1"
                className="rounded-lg border border-zinc-300 bg-white px-3 outline-none focus:border-amber-400 dark:border-zinc-700 dark:bg-zinc-900"
              />
              <button
                type="button"
                disabled={searching}
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
                    onOpen={() => openProfile(u)}
                    right={
                      u.relation === 'friend' ? (
                        <span className="text-[12px] font-bold text-emerald-500">친구</span>
                      ) : u.relation === 'outgoing' ? (
                        <span className="text-[12px] font-medium text-zinc-400">요청됨</span>
                      ) : u.relation === 'incoming' ? (
                        <button
                          type="button"
                          disabled={searching}
                          onClick={() => accept(u, true)}
                          className={`${btn} bg-emerald-500 text-white`}
                        >
                          수락
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={searching}
                          onClick={() => send(u)}
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

      {/* 친구 삭제 확인 — 되돌리려면 상대가 다시 수락해야 한다. */}
      {unfriendAsk && (
        <ModalShell
          onClose={() => setUnfriendAsk(null)}
          onSubmit={() => unfriend(unfriendAsk)}
          label="친구 삭제 확인"
        >
          <ModalLayout
            title="친구를 삭제할까요?"
            subtitle={
              <span className="font-bold text-zinc-600 dark:text-zinc-300">
                {unfriendAsk.nickname}
              </span>
            }
            footer={
              <>
                <ModalButton tone="ghost" onClick={() => setUnfriendAsk(null)}>
                  취소
                </ModalButton>
                <ModalButton tone="danger" onClick={() => unfriend(unfriendAsk)}>
                  삭제
                </ModalButton>
              </>
            }
          >
            <p className="text-center text-[12.5px] leading-relaxed text-zinc-500 dark:text-zinc-400">
              다시 친구가 되려면 상대가 요청을 수락해야 합니다.
            </p>
          </ModalLayout>
        </ModalShell>
      )}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="px-1 py-8 text-center text-[13px] text-zinc-500">{text}</p>;
}
