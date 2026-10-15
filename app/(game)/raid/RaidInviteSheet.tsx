'use client';

import { useEffect, useState, useTransition } from 'react';

import { ModalShell } from '@/components/ModalShell';
import { ModalLayout, ModalButton } from '@/components/ModalLayout';
import { LastSeen } from '@/components/LastSeen';
import { GuildBadge } from '@/components/GuildBadge';
import { Tabs } from '@/components/ui/Tabs';
import { ZoomSafeSelect } from '@/components/ui/ZoomSafeField';
import { useResourceToast } from '@/components/ResourceToast';
import { Avatar } from '@/app/(game)/friends/Avatar';
import { fmtNum } from '@/app/(game)/guild/guild-row';
import type { InviteCandidate } from '@/lib/game/raid/invite';

import { getRaidInviteCandidatesAction, inviteToRaidAction } from './actions';

type Tab = 'friend' | 'guild';

/** 정렬 — 강화 등록 팝업과 같은 방식(유저 요청 10-15 Eclipse #FXt19nCy): 기본은 전투력 높은순, 기기마다 기억한다(localStorage, 읽기·쓰기 실패는 기본값). */
const SORTS = [
  ['combat_desc', '전투력 높은순'],
  ['seen', '접속순'],
  ['name', '이름순'],
] as const;
type SortKey = (typeof SORTS)[number][0];
const SORT_STORAGE_KEY = 'ig:raid-invite-sort';
function loadSort(): SortKey {
  try {
    const raw = typeof window !== 'undefined' ? window.localStorage.getItem(SORT_STORAGE_KEY) : null;
    return SORTS.some(([k]) => k === raw) ? (raw as SortKey) : 'combat_desc';
  } catch {
    return 'combat_desc';
  }
}
function saveSort(v: SortKey) {
  try {
    window.localStorage.setItem(SORT_STORAGE_KEY, v);
  } catch {
    /* 비공개 창 등 — 저장 못 해도 이번 시트 안에서는 적용된다 */
  }
}
/** 어떤 정렬이든 이미 참여한 사람은 맨 아래(초대할 수 있는 사람이 위로). '초대함'은 제자리 —
 * 초대를 누를 때마다 행이 옮겨 가면 연달아 초대하는 손가락 위치가 어긋난다. */
function sortCandidates(list: InviteCandidate[], sort: SortKey): InviteCandidate[] {
  const seen = (c: InviteCandidate) => (c.lastSeenAt ? Date.parse(c.lastSeenAt) : 0);
  return [...list].sort(
    (a, b) =>
      Number(a.joined) - Number(b.joined) ||
      (sort === 'combat_desc'
        ? b.combat - a.combat || seen(b) - seen(a)
        : sort === 'seen'
          ? seen(b) - seen(a) || b.combat - a.combat
          : a.nickname.localeCompare(b.nickname, 'ko') || b.combat - a.combat),
  );
}

/**
 * 레이드 지목 초대 시트(A-1, 0146) — 친구/길드원 탭에서 한 명씩 초대.
 *
 * 초대는 곧 참여 허가라 상대는 수락 없이 들어온다. 인원 상한은 두지 않는다 —
 * 남은 자리가 1석이어도 여럿에게 보내 선착순으로 채우는 운용을 허용한다(정책 확정).
 * 중복 초대는 서버 유니크가 막고, 화면은 '초대함'으로 표시한다.
 */
export function RaidInviteSheet({
  raidId,
  participants,
  onClose,
  onKakaoShare,
}: {
  raidId: string;
  participants: number;
  onClose: () => void;
  /** 보조 수단 — 게임 안 친구가 없는 유저의 유일한 초대 경로라 유지한다. */
  onKakaoShare: () => void;
}) {
  const { showError, showHeaderToast } = useResourceToast();
  const [tab, setTab] = useState<Tab>('friend');
  const [sort, setSort] = useState<SortKey>(loadSort);
  const changeSort = (v: SortKey) => {
    setSort(v);
    saveSort(v);
  };
  const [data, setData] = useState<{ friends: InviteCandidate[]; guildMates: InviteCandidate[] } | null>(
    null,
  );
  const [failed, setFailed] = useState(false);
  const [invited, setInvited] = useState<Set<string>>(new Set());
  // 전역 pending으로 목록 전체를 잠그면 여러 명을 연달아 초대할 수 없다(선착순 운용에
  // 필요한 동작). 진행 중인 대상만 개별로 잠근다.
  const [sending, setSending] = useState<Set<string>>(new Set());
  const [, start] = useTransition();

  useEffect(() => {
    let alive = true;
    void (async () => {
      const r = await getRaidInviteCandidatesAction(raidId).catch(() => null);
      if (!alive) return;
      if (!r || r.status !== 'success') {
        setFailed(true);
        return;
      }
      setData({ friends: r.friends, guildMates: r.guildMates });
      // 서버가 준 기존 초대 상태를 로컬 집합의 출발점으로.
      setInvited(
        new Set(
          [...r.friends, ...r.guildMates].filter((c) => c.invited).map((c) => c.userId),
        ),
      );
    })();
    return () => {
      alive = false;
    };
  }, [raidId]);

  const invite = (c: InviteCandidate) => {
    if (sending.has(c.userId) || invited.has(c.userId) || c.joined) return;
    // 낙관 갱신 — 버튼을 누른 즉시 '초대함'으로 바꾸고, 실패하면 되돌린다.
    // 초대는 서버에서 멱등(23505 흡수)이라 되돌린 뒤 재시도해도 안전하다.
    setInvited((prev) => new Set(prev).add(c.userId));
    setSending((prev) => new Set(prev).add(c.userId));
    start(async () => {
      const r = await inviteToRaidAction(raidId, c.userId).catch(() => null);
      setSending((prev) => {
        const next = new Set(prev);
        next.delete(c.userId);
        return next;
      });
      if (!r || r.status !== 'success') {
        setInvited((prev) => {
          const next = new Set(prev);
          next.delete(c.userId);
          return next;
        });
        showError(r?.message ?? '초대에 실패했어요. 잠시 후 다시 시도해 주세요.');
        return;
      }
      showHeaderToast({ title: `${r.nickname}님 초대`, detail: '알림을 보냈어요' });
    });
  };

  const list = sortCandidates(tab === 'friend' ? (data?.friends ?? []) : (data?.guildMates ?? []), sort);

  return (
    <ModalShell onClose={onClose} label="동료 초대">
      <ModalLayout
        title="동료 초대"
        subtitle={
          <>
            <span className="block">
              현재 <b className="font-bold text-amber-500">{participants}</b> / 10명 · 초대하면 상대에게
              알림이 갑니다
            </span>
            {/* 정렬 셀렉트 — 강화 등록 팝업과 같은 부품·스타일. 설명 줄이 길어 그 아래 줄에 둔다(사용자 결정 10-15). 정렬은 두 탭에 공통. */}
            <ZoomSafeSelect
              value={sort}
              onChange={(e) => changeSort(e.target.value as SortKey)}
              aria-label="정렬"
              wrapClassName="mx-auto mt-2 h-[28px] w-[118px]"
              className="rounded-full border border-zinc-300 bg-transparent pl-2.5 pr-6 text-zinc-600 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-400"
            >
              {SORTS.map(([k, label]) => (
                <option key={k} value={k}>{label}</option>
              ))}
            </ZoomSafeSelect>
          </>
        }
        bodyPad="sm"
        footer={
          <>
            <ModalButton tone="ghost" onClick={onClose}>
              닫기
            </ModalButton>
            {/* 카카오톡 초대 — 공식 가이드(#FEE500 / 심볼 미변형 / 텍스트 #000 85%). */}
            <button
              type="button"
              onClick={onKakaoShare}
              style={{ flex: 1 }}
              className="flex items-center justify-center gap-1.5 rounded-xl bg-[#FEE500] py-2.5 transition active:scale-[0.99] hover:brightness-95"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/kakao/kakao_symbol.png" alt="" aria-hidden className="h-[15px] w-auto" />
              <span className="text-[13px] font-bold text-black/85">카카오톡 초대</span>
            </button>
          </>
        }
      >
        <Tabs
          size="sm"
          value={tab}
          onChange={setTab}
          items={[
            { key: 'friend' as const, label: '친구', count: data?.friends.length },
            { key: 'guild' as const, label: '길드원', count: data?.guildMates.length },
          ]}
        />

        {/* 높이 고정 — 탭마다 인원이 달라 팝업이 늘었다 줄었다 하면 손가락 위치가 어긋난다. */}
        <div className="mt-2 h-[44vh] overflow-y-auto">
          {failed ? (
            <p className="flex h-full items-center justify-center text-center text-[12px] text-zinc-400">
              목록을 불러오지 못했어요.
            </p>
          ) : data == null ? (
            <p className="flex h-full items-center justify-center text-center text-[12px] text-zinc-400">
              불러오는 중…
            </p>
          ) : list.length === 0 ? (
            <p className="flex h-full items-center justify-center text-center text-[12px] leading-relaxed text-zinc-400">
              {tab === 'friend'
                ? '아직 친구가 없어요.\n카카오톡 공유로 불러보세요.'
                : '길드에 소속되어 있지 않거나\n다른 길드원이 없어요.'}
            </p>
          ) : (
            <ul className="divide-y divide-zinc-100 dark:divide-zinc-900">
              {list.map((c) => {
                const done = c.joined || invited.has(c.userId);
                return (
                  <li key={c.userId} className="flex items-center gap-2 py-1.5">
                    <Avatar src={c.profileSouth} box={c.faceBox ?? null} size="h-10 w-10" />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline gap-1.5">
                        <span className="truncate text-[12.5px] font-semibold">{c.nickname}</span>
                        <LastSeen
                          at={c.lastSeenAt ?? null}
                          plain
                          className="ml-auto shrink-0 text-[9.5px] text-zinc-400"
                        />
                      </span>
                      {/* 누구를 부를지 판단하는 지표 — 길드원 목록과 같은 세트(전투·최고·합산). */}
                      <span className="mt-0.5 block truncate text-[10.5px] text-zinc-500">
                        전투{' '}
                        <b className="font-semibold tabular-nums text-zinc-700 dark:text-zinc-300">
                          {fmtNum(c.combat)}
                        </b>
                        <span className="mx-1 text-zinc-300 dark:text-zinc-700">·</span>
                        최고{' '}
                        <b className="font-semibold tabular-nums text-zinc-700 dark:text-zinc-300">
                          +{c.maxEnhance}
                        </b>
                        <span className="mx-1 text-zinc-300 dark:text-zinc-700">·</span>
                        합산{' '}
                        <b className="font-semibold tabular-nums text-zinc-700 dark:text-zinc-300">
                          {c.totalEnhance.toLocaleString('ko-KR')}
                        </b>
                      </span>
                      {/* 길드 줄은 소속 여부와 무관하게 항상 자리를 차지한다 — 미소속 행만
                          한 줄 낮아지면 목록이 들쭉날쭉해 손가락 위치가 어긋난다. */}
                      <span className="mt-0.5 flex h-[14px] items-center text-[10px] text-zinc-400">
                        {c.guildName ? (
                          <GuildBadge
                            emblemUrl={c.guildEmblemUrl}
                            name={c.guildName}
                            size={12}
                            className="min-w-0"
                          />
                        ) : (
                          <span className="text-zinc-300 dark:text-zinc-600">무소속</span>
                        )}
                      </span>
                    </span>
                    {c.joined ? (
                      <span className="shrink-0 rounded-full bg-zinc-100 px-2.5 py-1 text-[11px] font-bold text-zinc-400 dark:bg-zinc-800">
                        참여 중
                      </span>
                    ) : invited.has(c.userId) ? (
                      <span className="shrink-0 rounded-full bg-zinc-100 px-2.5 py-1 text-[11px] font-bold text-zinc-400 dark:bg-zinc-800">
                        초대함
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => invite(c)}
                        disabled={done || sending.has(c.userId)}
                        className="shrink-0 rounded-full bg-amber-600 px-3 py-1 text-[11px] font-bold text-white disabled:opacity-50"
                      >
                        초대
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </ModalLayout>
    </ModalShell>
  );
}
