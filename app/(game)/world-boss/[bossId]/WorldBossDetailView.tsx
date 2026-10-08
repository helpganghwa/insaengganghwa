'use client';

/**
 * 월드보스 상세 화면(시안 XnUD7HzvFRnJFUPZth5UGE, 2026-10-08 확정) — 보스 히어로·단계·전리품 → 내 원정대 패널(핀)
 * → [모집 중 | 출발] 원정대 카드 → 아래 고정 버튼(원정대 만들기). 액션은 서버 액션이 현재 경로를 재렌더해 props로
 * 새 상태가 내려오므로 router.refresh를 부르지 않는다(CLAUDE §11.7). 출발 직후와 '전투 보기'는 WorldBossReplay로 재생.
 */
import Link from 'next/link';
import { useMemo, useRef, useState, useTransition } from 'react';

import { BackFab } from '@/components/BackNav';
import { ModalLayout, ModalButton } from '@/components/ModalLayout';
import { ModalShell } from '@/components/ModalShell';
import { useResourceToast } from '@/components/ResourceToast';
import { Ticker } from '@/components/Ticker';
import { WORLD_BOSS_PARTY_MAX, worldBossExpectedAttacks } from '@/lib/game/guild/balance';
import { profileHref } from '@/lib/game/profile/href';
import { formatCompactKR } from '@/lib/ui/format-number';
import type { WorldBossBattle, WorldBossDetail, WorldBossPartyCard, WorldBossPerson } from '@/lib/game/world-boss/view-types';

import { WorldBossReplay } from './WorldBossReplay';

import {
  cancelRequestAction,
  createPartyAction,
  decideJoinAction,
  departPartyAction,
  getBattleAction,
  leavePartyAction,
  requestJoinAction,
} from '../actions';

type ActionRes = { status: 'success' } | { status: 'error'; message: string };

function remain(ms: number): string {
  const m = Math.ceil(ms / 60_000);
  if (m <= 0) return '곧 떠나요';
  const h = Math.floor(m / 60);
  return h > 0 ? `${h}시간 ${m % 60}분 남음` : `${m}분 남음`;
}
const fmtAvg = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
const won = (n: number) => n.toLocaleString('ko-KR');

export function WorldBossDetailView({
  detail: d,
  serverId,
  spriteSrc,
  bgSrc,
}: {
  detail: WorldBossDetail;
  serverId: number;
  spriteSrc: string;
  bgSrc: string;
}) {
  const { showError, showHeaderToast } = useResourceToast();
  const [pending, start] = useTransition();
  const [tab, setTab] = useState<'recruiting' | 'departed'>('recruiting');
  const [departAsk, setDepartAsk] = useState(false);
  const [replay, setReplay] = useState<WorldBossBattle | null>(null);
  // 출발 멱등 키 — 같은 원정대에 한 번 만들어 재전송해도 같은 결과(서버 depart_key).
  const departKey = useRef<string | null>(null);

  const active = d.status === 'active';
  const me = d.me;
  const mp = d.myParty;
  const recruiting = useMemo(() => d.parties.filter((p) => p.status === 'recruiting' && p.id !== mp?.partyId), [d.parties, mp]);
  const departed = useMemo(
    () => d.parties.filter((p) => p.status === 'departed').sort((a, b) => b.damage - a.damage),
    [d.parties],
  );
  const pct = d.need > 0 ? Math.min(100, (d.into / d.need) * 100) : 0;

  const run = (fn: () => Promise<ActionRes>, ok?: { title: string; detail?: string }) =>
    start(async () => {
      const r = await fn().catch(() => ({ status: 'error' as const, message: '지금은 처리할 수 없어요. 잠시 후 다시 시도해 주세요.' }));
      if (r.status === 'error') return showError(r.message);
      if (ok) showHeaderToast({ icon: '⚔️', ...ok });
    });

  const depart = () => {
    if (!mp) return;
    departKey.current ??= crypto.randomUUID();
    const key = departKey.current;
    setDepartAsk(false);
    start(async () => {
      const r = await departPartyAction(d.id, mp.partyId, key).catch(() => null);
      if (!r) return showError('지금은 처리할 수 없어요. 잠시 후 다시 시도해 주세요.');
      if (r.status === 'error') return showError(r.message);
      const f = r.result.finale;
      if (f) {
        setReplay({ partyId: r.result.partyId, leaderNickname: mp.members.find((m) => m.isLeader)?.nickname ?? '', finale: f, stageFrom: r.result.stageFrom, stageTo: r.result.stageTo, reward: r.result.reward });
      }
    });
  };

  const openBattle = (partyId: string) =>
    start(async () => {
      const r = await getBattleAction(partyId).catch(() => null);
      if (!r) return showError('지금은 처리할 수 없어요. 잠시 후 다시 시도해 주세요.');
      if (r.status === 'error') return showError(r.message);
      setReplay(r.battle);
    });

  return (
    <div className="flex-1 pb-28">
      {/* 히어로 — 지역 배경 + 보스 그림 + 이름·구역·주인·남은 시간 */}
      <div className="relative h-[150px] overflow-hidden bg-zinc-950">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={bgSrc} alt="" className="absolute inset-0 h-full w-full object-cover" style={{ imageRendering: 'pixelated' }} />
        <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/40 to-black/10" />
        <BackFab fallback="/guild/map" className="absolute left-3 top-3 z-10" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={spriteSrc}
          alt={d.name}
          className="absolute bottom-2 left-3 h-24 w-24 object-contain"
          style={{ imageRendering: 'pixelated', filter: 'drop-shadow(0 0 1px #000) drop-shadow(0 0 1px #000) drop-shadow(0 0 10px rgba(251,191,36,0.6))' }}
        />
        <div className="absolute bottom-3 left-[118px] right-3 flex flex-col">
          <h1 className="truncate text-[19px] font-extrabold text-amber-200 drop-shadow-[0_1px_3px_rgba(0,0,0,0.95)]">{d.name}</h1>
          <p className="truncate text-[11px] text-zinc-200 drop-shadow-[0_1px_2px_rgba(0,0,0,0.95)]">
            {d.zoneName}
            {d.ownerGuildName ? ` · ${d.ownerGuildName} 땅` : ' · 주인 없음'} ·{' '}
            {active ? (
              <Ticker intervalMs={60_000}>{(now) => <span className="text-amber-300">{remain(d.leaveAt - now)}</span>}</Ticker>
            ) : (
              <span className="text-zinc-400">떠났어요</span>
            )}
          </p>
        </div>
      </div>

      {/* 단계 · 전리품 · 누적 피해 */}
      <div className="mx-3 mt-3 grid grid-cols-3 gap-1.5">
        <Stat big={`${d.stage}단계`} small="지금 단계" />
        <Stat big={`💎${won(d.lootDiamond)} 📦${d.lootBoxes}`} small="쌓인 전리품" />
        <Stat big={formatCompactKR(d.totalDamage)} small="누적 피해" />
      </div>
      <div className="mx-3 mt-2 h-2 overflow-hidden rounded-full bg-amber-900/40">
        <div className="h-full rounded-full bg-gradient-to-r from-amber-500 to-yellow-300" style={{ width: `${pct}%` }} />
      </div>
      <div className="mx-3 mt-1 flex justify-between text-[10.5px] text-zinc-400">
        <span>{d.stage + 1}단계까지</span>
        <span className="font-mono tabular-nums">
          {formatCompactKR(d.into)} / {formatCompactKR(d.need)}
        </span>
      </div>
      <p className="mx-3 mt-1.5 text-[11px] text-zinc-500">
        {active ? (
          d.ownerGuildName ? (
            <>
              전리품은 보스가 떠나는 순간 {d.zoneName}을 가진 길드의 금고로 들어가요. 지금은 <b className="text-zinc-300">{d.ownerGuildName}</b>예요.
            </>
          ) : (
            '지금은 이 구역에 주인이 없어 원정대를 만들 수 없어요. 떠날 때도 주인이 없으면 전리품은 사라져요.'
          )
        ) : d.settledGuildName ? (
          `떠나며 ${d.settledGuildName} 금고에 💎${won(d.lootDiamond)} 📦${d.lootBoxes}을 남겼어요.`
        ) : (
          '떠날 때 주인이 없어 전리품은 사라졌어요.'
        )}
      </p>

      {/* 내 원정대 패널(핀) */}
      {mp && (
        <section className="mx-3 mt-3 rounded-xl border border-amber-500/45 bg-zinc-900 p-3">
          <div className="mb-1.5 flex items-center gap-1.5">
            <b className="text-[13px] text-zinc-100">내 원정대</b>
            <span
              className={`rounded-full px-1.5 py-px text-[9.5px] font-extrabold ${mp.isLeader ? 'bg-amber-500 text-amber-950' : 'bg-zinc-700 text-zinc-200'}`}
            >
              {mp.isLeader ? '대장' : '원정대원'}
            </span>
            <span className="ml-auto font-mono text-[11px] font-extrabold tabular-nums text-amber-300">
              {mp.members.length}/{WORLD_BOSS_PARTY_MAX}
            </span>
          </div>
          {mp.members.map((m) => (
            <PersonRow key={m.userId} p={m} serverId={serverId} leader={m.isLeader} />
          ))}
          {mp.isLeader && mp.status === 'recruiting' && mp.requests.length > 0 && (
            <div className="mt-2 border-t border-dashed border-zinc-700 pt-2">
              <b className="text-[11px] text-amber-300">신청 {mp.requests.length}건</b>
              {mp.requests.map((r) => (
                <PersonRow key={r.userId} p={r} serverId={serverId}>
                  <button
                    type="button"
                    disabled={pending || mp.members.length >= WORLD_BOSS_PARTY_MAX}
                    onClick={() => run(() => decideJoinAction(d.id, mp.partyId, r.userId, true))}
                    className="rounded-md bg-amber-500 px-2 py-0.5 text-[10.5px] font-bold text-amber-950 disabled:opacity-40"
                  >
                    수락
                  </button>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => run(() => decideJoinAction(d.id, mp.partyId, r.userId, false))}
                    className="rounded-md bg-zinc-800 px-2 py-0.5 text-[10.5px] font-bold text-zinc-400 disabled:opacity-40"
                  >
                    거절
                  </button>
                </PersonRow>
              ))}
            </div>
          )}
          {mp.status === 'recruiting' ? (
            <>
              <p className="mt-2 text-[10.5px] text-zinc-400">
                {mp.isLeader ? (
                  <>
                    지금 인원이면 1명당 평균 <b className="text-amber-300">{fmtAvg(worldBossExpectedAttacks(mp.members.length))}번</b> 공격
                    {mp.members.length < WORLD_BOSS_PARTY_MAX && ` · 10명이 차면 ${fmtAvg(worldBossExpectedAttacks(WORLD_BOSS_PARTY_MAX))}번`}
                  </>
                ) : (
                  '대장이 출발을 누르면 바로 싸워요. 결과와 보상은 우편으로 와요.'
                )}
              </p>
              {mp.isLeader ? (
                <>
                  <button
                    type="button"
                    disabled={pending || !active}
                    onClick={() => (mp.members.length < WORLD_BOSS_PARTY_MAX ? setDepartAsk(true) : depart())}
                    className="mt-2 w-full rounded-lg bg-amber-500 py-2.5 text-[13px] font-extrabold text-amber-950 disabled:opacity-40"
                  >
                    출발
                  </button>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => run(() => leavePartyAction(d.id, mp.partyId), { title: '원정대를 해산했어요' })}
                    className="mt-1.5 w-full text-[10.5px] text-zinc-500 underline disabled:opacity-40"
                  >
                    원정대 해산
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => run(() => leavePartyAction(d.id, mp.partyId), { title: '원정대에서 나왔어요' })}
                  className="mt-2 w-full rounded-lg border border-amber-500/45 bg-zinc-800 py-2 text-[12.5px] font-bold text-amber-300 disabled:opacity-40"
                >
                  나가기
                </button>
              )}
            </>
          ) : (
            (() => {
              const card = d.parties.find((p) => p.id === mp.partyId);
              return card ? <DepartedSummary p={card} mine onBattle={() => openBattle(card.id)} /> : null;
            })()
          )}
        </section>
      )}

      {/* 원정대 목록 — 모집 중 / 출발 */}
      <div className="mx-3 mt-3 flex gap-1 rounded-xl bg-zinc-900 p-1">
        {(
          [
            ['recruiting', `모집 중 ${recruiting.length}`],
            ['departed', `출발 ${departed.length}`],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            aria-pressed={tab === k}
            className={`flex-1 rounded-lg py-1.5 text-[11.5px] font-bold ${tab === k ? 'bg-amber-500 text-amber-950' : 'text-zinc-400'}`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="mx-3 mt-2 flex flex-col gap-2">
        {tab === 'recruiting' ? (
          recruiting.length === 0 ? (
            <Empty text={active ? '모집 중인 원정대가 없어요.' : '보스가 떠나 모집이 끝났어요.'} />
          ) : (
            recruiting.map((p) => {
              const isPending = me?.pendingPartyId === p.id;
              const canRequest = active && me?.state === 'none' && p.memberCount < WORLD_BOSS_PARTY_MAX;
              return (
                <div key={p.id} className="rounded-xl border border-zinc-800 bg-zinc-900 p-2.5">
                  <PartyHead p={p} />
                  <div className="my-1.5 flex gap-[3px]">
                    {Array.from({ length: WORLD_BOSS_PARTY_MAX }, (_, i) => (
                      <i key={i} className={`h-[5px] flex-1 rounded-sm ${i < p.memberCount ? 'bg-amber-500' : 'bg-zinc-800'}`} />
                    ))}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 text-[10.5px] text-zinc-400">
                      {p.memberCount >= WORLD_BOSS_PARTY_MAX
                        ? '가득 찼어요'
                        : isPending
                          ? '대장 수락을 기다리는 중'
                          : `1명당 평균 ${fmtAvg(worldBossExpectedAttacks(p.memberCount))}번 공격`}
                    </span>
                    {isPending ? (
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => run(() => cancelRequestAction(d.id, p.id), { title: '신청을 취소했어요' })}
                        className="rounded-lg border border-amber-500/45 bg-zinc-800 px-3 py-1.5 text-[11.5px] font-bold text-amber-300 disabled:opacity-40"
                      >
                        신청 취소
                      </button>
                    ) : canRequest ? (
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() =>
                          run(() => requestJoinAction(d.id, p.id), { title: '참가를 신청했어요', detail: '대장이 수락하면 알려 드려요' })
                        }
                        className="rounded-lg bg-amber-500 px-3 py-1.5 text-[11.5px] font-bold text-amber-950 disabled:opacity-40"
                      >
                        참가 신청
                      </button>
                    ) : null}
                  </div>
                </div>
              );
            })
          )
        ) : departed.length === 0 ? (
          <Empty text="아직 출발한 원정대가 없어요." />
        ) : (
          departed.map((p) => (
            <div key={p.id} className={`rounded-xl border bg-zinc-900 p-2.5 ${p.id === mp?.partyId ? 'border-amber-500/55' : 'border-zinc-800'}`}>
              <PartyHead p={p} />
              <DepartedSummary p={p} onBattle={() => openBattle(p.id)} />
            </div>
          ))
        )}
      </div>

      {/* 아래 고정 — 원정대 만들기 / 상태 안내 */}
      {active && !mp && (
        <div className="fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom,0px)+56px)] z-20 mx-auto w-full max-w-[390px] bg-gradient-to-t from-zinc-950 via-zinc-950/95 to-transparent px-3 pb-3 pt-6">
          {me?.canCreate ? (
            <>
              <button
                type="button"
                disabled={pending}
                onClick={() => run(() => createPartyAction(d.id), { title: '원정대를 만들었어요', detail: '함께 갈 사람을 기다려요' })}
                className="w-full rounded-lg bg-amber-500 py-2.5 text-[13px] font-extrabold text-amber-950 disabled:opacity-40"
              >
                원정대 만들기
              </button>
              <p className="mt-1 text-center text-[10px] text-zinc-500">{d.ownerGuildName} 길드원 · 아직 이 보스와 싸우지 않았어요</p>
            </>
          ) : (
            <p className="text-center text-[10.5px] text-zinc-400">
              {!me
                ? '로그인하면 원정대에 참가할 수 있어요.'
                : me.state === 'fought'
                  ? '이 보스와는 이미 싸웠어요(보스 하나에 1인 1번).'
                  : me.state === 'pending'
                    ? '신청한 원정대의 대장 수락을 기다리는 중이에요.'
                    : d.ownerGuildName
                      ? `원정대 만들기는 ${d.ownerGuildName} 길드원만 · 모집 중 원정대에 신청해 보세요.`
                      : '지금은 원정대를 만들 수 없어요.'}
            </p>
          )}
        </div>
      )}

      {/* 10명 미만 출발 확인(시안 문구) */}
      {departAsk && mp && (
        <ModalShell onClose={() => setDepartAsk(false)} onSubmit={depart} label="출발 확인">
          <ModalLayout
            title={`${mp.members.length}명으로 출발할까요?`}
            footer={
              <>
                <ModalButton onClick={() => setDepartAsk(false)}>기다리기</ModalButton>
                <ModalButton tone="primary" grow={2} onClick={depart} disabled={pending}>
                  출발
                </ModalButton>
              </>
            }
          >
            <p className="text-[12.5px] leading-relaxed text-zinc-600 dark:text-zinc-300">
              10명이 차면 1명당 평균 {fmtAvg(worldBossExpectedAttacks(WORLD_BOSS_PARTY_MAX))}번 공격해요. 지금은{' '}
              {fmtAvg(worldBossExpectedAttacks(mp.members.length))}번이에요. 출발하면 되돌릴 수 없어요.
            </p>
          </ModalLayout>
        </ModalShell>
      )}

      {/* 전투 재생(출발 직후·전투 보기) — 끝나면 결과 카드 */}
      {replay && <WorldBossReplay battle={replay} bossName={d.name} spriteSrc={spriteSrc} onClose={() => setReplay(null)} />}
    </div>
  );
}

function Stat({ big, small }: { big: string; small: string }) {
  return (
    <div className="flex min-w-0 flex-col rounded-lg border border-zinc-800 bg-zinc-900 px-2 py-1.5">
      <b className="truncate text-[13px] text-amber-300">{big}</b>
      <span className="truncate text-[9.5px] text-zinc-500">{small}</span>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="rounded-lg border border-dashed border-zinc-800 py-5 text-center text-[11.5px] text-zinc-500">{text}</p>;
}

function PartyHead({ p }: { p: WorldBossPartyCard }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <b className="truncate text-[12.5px] text-zinc-100">{p.leaderNickname} 원정대</b>
      {p.guildName && <span className="truncate text-[10px] text-zinc-500">{p.guildName}</span>}
      <span className="ml-auto shrink-0 font-mono text-[11px] font-extrabold tabular-nums text-amber-300">
        {p.status === 'departed' ? `${p.memberCount}명` : `${p.memberCount}/${WORLD_BOSS_PARTY_MAX}`}
      </span>
    </div>
  );
}

function DepartedSummary({ p, mine = false, onBattle }: { p: WorldBossPartyCard; mine?: boolean; onBattle?: () => void }) {
  const moved = (p.stageTo ?? 0) - (p.stageFrom ?? 0);
  return (
    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
      <span className="min-w-0 flex-1 text-[10.5px] text-zinc-400">
        {mine && '출발함 · '}피해 <b className="text-zinc-100">{formatCompactKR(p.damage)}</b> · {p.rounds}라운드 ·{' '}
        {moved > 0 ? `${p.stageFrom}→${p.stageTo}단계` : '단계 그대로'}
      </span>
      <span className="rounded-full border border-amber-500/50 px-2 py-px text-[9.5px] text-amber-300">
        💎{p.rewardDiamond} 📦{p.rewardBoxes}
      </span>
      {onBattle && (
        <button type="button" onClick={onBattle} className="rounded-lg border border-amber-500/45 bg-zinc-800 px-2.5 py-1 text-[11px] font-bold text-amber-300">
          {mine ? '내 전투 보기' : '전투 보기'}
        </button>
      )}
    </div>
  );
}

function PersonRow({
  p,
  serverId,
  leader = false,
  children,
}: {
  p: WorldBossPerson;
  serverId: number;
  leader?: boolean;
  children?: React.ReactNode;
}) {
  const name = (
    <span className="truncate">
      {p.nickname}
      {leader && <i className="ml-1 not-italic text-[9px] text-amber-300">대장</i>}
    </span>
  );
  return (
    <div className="flex items-center gap-2 border-t border-zinc-800 py-1.5 text-[11.5px] text-zinc-200 first:border-t-0">
      {p.code ? (
        <Link prefetch={false} href={profileHref(p.code, serverId)} className="flex min-w-0 flex-1">
          {name}
        </Link>
      ) : (
        <span className="flex min-w-0 flex-1">{name}</span>
      )}
      <span className="shrink-0 text-[10px] text-zinc-500">{p.guildName ?? '무소속'}</span>
      <span className="shrink-0 font-mono text-[10.5px] tabular-nums text-zinc-400">{formatCompactKR(p.combat)}</span>
      {children}
    </div>
  );
}
