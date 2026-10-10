'use client';

/**
 * 원정대 초대 시트(docs/WORLD-BOSS.md §2, 10-11 사용자 2안) — 내 원정대 패널의 빈 자리를 누르면 열린다.
 * 친구·같은 길드원 중 이 서버에 캐릭터가 있는 사람을 보여 주고 '초대'를 누르면 상대에게 푸시가 간다. 상대가 수락하면 바로 참가.
 * 목록은 열릴 때 한 번 받고, 초대/취소는 부모(상세 뷰)가 낙관적으로 myParty.invites를 바꿔 그대로 반영된다.
 */
import { useEffect, useState } from 'react';

import { ModalButton, ModalLayout } from '@/components/ModalLayout';
import { ModalShell } from '@/components/ModalShell';
import { GuildBadge } from '@/components/GuildBadge';
import type { WorldBossInvitable, WorldBossPerson } from '@/lib/game/world-boss/view-types';
import { formatCompactKR } from '@/lib/ui/format-number';

import { Avatar } from '../../friends/Avatar';
import { invitableAction } from '../actions';

const SOURCE_KO: Record<WorldBossInvitable['source'], string> = { friend: '친구', guild: '길드원', both: '친구 · 길드원' };

export function InviteSheet({
  bossId,
  partyId,
  invited,
  full,
  busy,
  onInvite,
  onCancel,
  onClose,
}: {
  bossId: string;
  partyId: string;
  /** 지금 초대 중(대기)인 사람들 — 부모의 낙관 상태. */
  invited: WorldBossPerson[];
  /** 정원이 찼으면 초대 버튼을 막는다(대기 중 초대는 정원에 세지 않는다 — 수락 때 검사). */
  full: boolean;
  busy: boolean;
  onInvite: (p: WorldBossInvitable) => void;
  onCancel: (userId: string) => void;
  onClose: () => void;
}) {
  const [list, setList] = useState<WorldBossInvitable[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    invitableAction(bossId, partyId)
      .then((r) => {
        if (!alive) return;
        if (r.status === 'error') setError(r.message);
        else setList(r.people);
      })
      .catch(() => alive && setError('목록을 불러오지 못했어요.'));
    return () => {
      alive = false;
    };
  }, [bossId, partyId]);
  const invitedIds = new Set(invited.map((p) => p.userId));

  return (
    <ModalShell onClose={onClose} label="원정대 초대">
      <ModalLayout title="원정대 초대" subtitle="친구와 길드원 중에서 골라요. 수락하면 바로 함께 싸워요." maxBodyClass="max-h-[56vh]" footer={<ModalButton onClick={onClose}>닫기</ModalButton>}>
        {error ? (
          <p className="py-6 text-center text-[12px] text-stone-500">{error}</p>
        ) : !list ? (
          <p className="py-6 text-center text-[12px] text-stone-500">불러오는 중…</p>
        ) : list.length === 0 ? (
          <p className="py-6 text-center text-[12px] text-stone-500">초대할 수 있는 친구·길드원이 없어요.</p>
        ) : (
          <ul className="-mx-1 divide-y divide-zinc-200 dark:divide-zinc-800">
            {list.map((p) => {
              // 상태는 서버 목록 + 부모의 낙관 상태를 합친다(초대 직후에도 '초대 취소'로 바로 바뀌게).
              const state: WorldBossInvitable['state'] = p.state === 'ok' && invitedIds.has(p.userId) ? 'invited' : p.state === 'invited' && !invitedIds.has(p.userId) ? 'ok' : p.state;
              return (
                <li key={p.userId} className="flex items-center gap-2.5 px-1 py-2">
                  <Avatar src={p.avatarSrc} box={p.faceBox} size="h-9 w-9 shrink-0 rounded-full bg-stone-800" />
                  <span className="min-w-0 flex-1 leading-tight">
                    <span className="flex min-w-0 items-center gap-1 whitespace-nowrap text-[12.5px] font-bold text-zinc-900 dark:text-stone-100">
                      <span className="truncate">{p.nickname}</span>
                      <span className="shrink-0 rounded bg-zinc-200 px-1 text-[8.5px] font-bold text-zinc-600 dark:bg-stone-800 dark:text-stone-400">{SOURCE_KO[p.source]}</span>
                    </span>
                    <span className="flex min-w-0 items-center gap-1 whitespace-nowrap text-[10px] text-zinc-500 dark:text-stone-400">
                      {p.guildName ? <GuildBadge emblemUrl={p.guildEmblemUrl} emblemColor={p.guildEmblemColor} name={p.guildName} size={10} className="min-w-0 max-w-[90px]" /> : <span>무소속</span>}
                      <span className="shrink-0">· 전투력 {formatCompactKR(p.combat)}</span>
                    </span>
                  </span>
                  {state === 'ok' ? (
                    <button
                      type="button"
                      disabled={busy || full}
                      onClick={() => onInvite(p)}
                      className="shrink-0 rounded-lg border border-orange-500/70 px-2.5 py-1.5 text-[11.5px] font-extrabold text-orange-600 disabled:opacity-40 dark:text-orange-300"
                    >
                      초대
                    </button>
                  ) : state === 'invited' ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => onCancel(p.userId)}
                      className="shrink-0 rounded-lg border border-zinc-300 px-2.5 py-1.5 text-[11.5px] font-bold text-zinc-500 disabled:opacity-40 dark:border-stone-600 dark:text-stone-400"
                    >
                      초대 취소
                    </button>
                  ) : (
                    <span className="shrink-0 text-[10.5px] text-zinc-400 dark:text-stone-500">{state === 'in_party' ? '다른 원정대' : '이미 싸움'}</span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {full && <p className="mt-2 text-center text-[10.5px] text-stone-500">원정대가 가득 차서 지금은 초대할 수 없어요.</p>}
      </ModalLayout>
    </ModalShell>
  );
}
