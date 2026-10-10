'use client';

/**
 * 원정대 초대 시트(docs/WORLD-BOSS.md §2, 10-11 사용자: 레이드 초대와 같은 방식) — 내 원정대 패널의 빈 자리를 누르면 열린다.
 * 레이드 지목 초대 시트와 같은 구성: 친구/길드원 탭(인원 수), 고정 높이 목록, 행마다 얼굴·이름·접속·전투력·길드, 오른쪽 '초대' 알약.
 * 초대는 곧 참여 허가 — 상대는 모집 카드에서 신청·수락 없이 '참가'로 바로 들어온다. 행마다 따로 잠가 여럿을 연달아 초대할 수 있다.
 * 이미 다른 원정대에 있거나(다른 원정대) 이 보스와 싸운 사람(토벌 완료)은 흐리게 두고 맨 아래로 — 숨기지 않아 "왜 못 부르는지"가 보인다.
 */
import { useEffect, useState, useTransition } from 'react';

import { GuildBadge } from '@/components/GuildBadge';
import { LastSeen } from '@/components/LastSeen';
import { ModalButton, ModalLayout } from '@/components/ModalLayout';
import { ModalShell } from '@/components/ModalShell';
import { useResourceToast } from '@/components/ResourceToast';
import { Tabs } from '@/components/ui/Tabs';
import { WORLD_BOSS_PARTY_MAX } from '@/lib/game/guild/balance';
import type { WorldBossInvitable } from '@/lib/game/world-boss/view-types';
import { formatCompactKR } from '@/lib/ui/format-number';

import { Avatar } from '../../friends/Avatar';
import { cancelInviteAction, invitableAction, inviteAction } from '../actions';

type Tab = 'friend' | 'guild';

export function InviteSheet({
  bossId,
  partyId,
  participants,
  onClose,
  onChanged,
}: {
  bossId: string;
  partyId: string;
  participants: number;
  onClose: () => void;
  /** 초대/취소가 서버에 반영된 뒤 — 부모가 패널의 '초대 중' 칸을 다시 받게. */
  onChanged?: () => void;
}) {
  const { showError, showHeaderToast } = useResourceToast();
  const [tab, setTab] = useState<Tab>('friend');
  const [data, setData] = useState<WorldBossInvitable[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [invited, setInvited] = useState<Set<string>>(new Set());
  // 전역 pending으로 목록 전체를 잠그면 여러 명을 연달아 초대할 수 없다 — 진행 중인 대상만 개별로 잠근다(레이드와 같다).
  const [sending, setSending] = useState<Set<string>>(new Set());
  const [, start] = useTransition();

  useEffect(() => {
    let alive = true;
    void (async () => {
      const r = await invitableAction(bossId, partyId).catch(() => null);
      if (!alive) return;
      if (!r || r.status !== 'success') {
        setFailed(true);
        return;
      }
      setData(r.people);
      setInvited(new Set(r.people.filter((c) => c.state === 'invited').map((c) => c.userId)));
    })();
    return () => {
      alive = false;
    };
  }, [bossId, partyId]);

  const lock = (id: string, on: boolean) =>
    setSending((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  const mark = (id: string, on: boolean) =>
    setInvited((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  const invite = (c: WorldBossInvitable) => {
    if (sending.has(c.userId) || invited.has(c.userId) || c.state === 'in_party' || c.state === 'fought') return;
    // 낙관 갱신 — 누르는 즉시 '초대함', 실패하면 되돌린다.
    mark(c.userId, true);
    lock(c.userId, true);
    start(async () => {
      const r = await inviteAction(bossId, partyId, c.userId).catch(() => null);
      lock(c.userId, false);
      if (!r || r.status !== 'success') {
        mark(c.userId, false);
        showError(r?.message ?? '초대에 실패했어요. 잠시 후 다시 시도해 주세요.');
        return;
      }
      showHeaderToast({ title: `${c.nickname}님 초대`, detail: '알림을 보냈어요' });
      onChanged?.();
    });
  };
  const cancel = (c: WorldBossInvitable) => {
    if (sending.has(c.userId)) return;
    mark(c.userId, false);
    lock(c.userId, true);
    start(async () => {
      const r = await cancelInviteAction(bossId, partyId, c.userId).catch(() => null);
      lock(c.userId, false);
      if (!r || r.status !== 'success') {
        mark(c.userId, true);
        showError(r?.message ?? '취소하지 못했어요.');
        return;
      }
      onChanged?.();
    });
  };

  const list = (data ?? []).filter((c) => (tab === 'friend' ? c.source !== 'guild' : c.source !== 'friend'));
  const friendCount = data?.filter((c) => c.source !== 'guild').length;
  const guildCount = data?.filter((c) => c.source !== 'friend').length;

  return (
    <ModalShell onClose={onClose} label="원정대 초대">
      <ModalLayout
        title="원정대 초대"
        subtitle={
          <>
            현재 <b className="font-bold text-amber-500">{participants}</b> / {WORLD_BOSS_PARTY_MAX}명 · 초대하면 상대에게 알림이 가고, 상대는 바로 참가할 수 있어요
          </>
        }
        bodyPad="sm"
        footer={
          <ModalButton tone="ghost" onClick={onClose}>
            닫기
          </ModalButton>
        }
      >
        <Tabs
          size="sm"
          value={tab}
          onChange={setTab}
          items={[
            { key: 'friend' as const, label: '친구', count: friendCount },
            { key: 'guild' as const, label: '길드원', count: guildCount },
          ]}
        />

        {/* 높이 고정 — 탭마다 인원이 달라 팝업이 늘었다 줄었다 하면 손가락 위치가 어긋난다(레이드와 같다). */}
        <div className="mt-2 h-[44vh] overflow-y-auto">
          {failed ? (
            <p className="flex h-full items-center justify-center text-center text-[12px] text-zinc-400">목록을 불러오지 못했어요.</p>
          ) : data == null ? (
            <p className="flex h-full items-center justify-center text-center text-[12px] text-zinc-400">불러오는 중…</p>
          ) : list.length === 0 ? (
            <p className="flex h-full items-center justify-center whitespace-pre-line text-center text-[12px] leading-relaxed text-zinc-400">
              {tab === 'friend' ? '이 서버에 캐릭터가 있는 친구가 없어요.' : '길드에 소속되어 있지 않거나\n다른 길드원이 없어요.'}
            </p>
          ) : (
            <ul className="divide-y divide-zinc-100 dark:divide-zinc-900">
              {list.map((c) => {
                const blocked = c.state === 'in_party' || c.state === 'fought';
                const isInvited = invited.has(c.userId);
                return (
                  <li key={c.userId} className={`flex items-center gap-2 py-1.5 ${blocked ? 'opacity-55' : ''}`}>
                    <Avatar src={c.avatarSrc} box={c.faceBox} size="h-10 w-10" />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline gap-1.5">
                        <span className="truncate text-[12.5px] font-semibold">{c.nickname}</span>
                        <LastSeen at={c.lastSeenAt ?? null} plain className="ml-auto shrink-0 text-[9.5px] text-zinc-400" />
                      </span>
                      {/* 누구를 부를지 판단하는 지표 — 월드보스 전투력(장착 3개 + 아바타·공개된 약점 보너스). */}
                      <span className="mt-0.5 block truncate text-[10.5px] text-zinc-500">
                        전투력 <b className="font-semibold tabular-nums text-zinc-700 dark:text-zinc-300">{formatCompactKR(c.combat)}</b>
                      </span>
                      {/* 길드 줄은 소속 여부와 무관하게 항상 자리를 차지한다 — 행 높이가 들쭉날쭉하면 손가락 위치가 어긋난다. */}
                      <span className="mt-0.5 flex h-[14px] items-center text-[10px] text-zinc-400">
                        {c.guildName ? (
                          <GuildBadge emblemUrl={c.guildEmblemUrl} emblemColor={c.guildEmblemColor} name={c.guildName} size={12} className="min-w-0" />
                        ) : (
                          <span className="text-zinc-300 dark:text-zinc-600">무소속</span>
                        )}
                      </span>
                    </span>
                    {blocked ? (
                      <span className="shrink-0 rounded-full bg-zinc-100 px-2.5 py-1 text-[11px] font-bold text-zinc-400 dark:bg-zinc-800">
                        {c.state === 'fought' ? '토벌 완료' : '다른 원정대'}
                      </span>
                    ) : isInvited ? (
                      <button
                        type="button"
                        onClick={() => cancel(c)}
                        disabled={sending.has(c.userId)}
                        className="shrink-0 rounded-full bg-zinc-100 px-2.5 py-1 text-[11px] font-bold text-zinc-400 disabled:opacity-50 dark:bg-zinc-800"
                      >
                        초대함
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => invite(c)}
                        disabled={sending.has(c.userId) || participants >= WORLD_BOSS_PARTY_MAX}
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
