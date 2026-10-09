'use client';

/**
 * 월드보스 상세 화면(docs/WORLD-BOSS.md §9). 위에서부터: 히어로 → 단계·전리품 한 장 → **지금 할 일**(상태별: 만들기·신청 대기·
 * 내 원정대 패널·안내) → [모집 중 | 출발] 원정대 카드. 2026-10-08 리뷰 반영: 아래 고정 버튼이 채팅 미니바에 가려 행동 영역을
 * 본문 위쪽으로 올렸고, 원정대원은 얼굴 칸 2열로 압축했다. 액션은 서버 액션이 현재 경로를 재렌더해 새 상태가 props로 온다
 * (router.refresh 없음, CLAUDE §11.7). 출발 직후와 '전투 보기'는 WorldBossReplay로 재생.
 */
import Link from 'next/link';
import { josa } from 'josa';
import { useMemo, useRef, useState, useTransition } from 'react';

import { BackFab } from '@/components/BackNav';
import { ModalLayout, ModalButton } from '@/components/ModalLayout';
import { ModalShell } from '@/components/ModalShell';
import { useResourceToast } from '@/components/ResourceToast';
import { Ticker } from '@/components/Ticker';
import { WorldBossBackdrop } from '@/components/WorldBossBackdrop';
import { WorldBossSprite } from '@/components/WorldBossSprite';
import { WORLD_BOSS_PARTY_MAX, worldBossExpectedAttacks } from '@/lib/game/guild/balance';
import { profileHref } from '@/lib/game/profile/href';
import { formatCompactKR } from '@/lib/ui/format-number';
import type { WorldBossBattle, WorldBossDetail, WorldBossPartyCard, WorldBossPerson } from '@/lib/game/world-boss/view-types';
import { worldBossBgEmberUrl } from '@/lib/game/world-boss/bosses';
import { assetUrl } from '@/lib/asset-versions';

import { Avatar } from '../../friends/Avatar';
import {
  cancelRequestAction,
  createPartyAction,
  decideJoinAction,
  departPartyAction,
  equipBestAction,
  getBattleAction,
  leavePartyAction,
  requestJoinAction,
} from '../actions';
import { WeakPanel } from './WeakPanel';
import { WorldBossReplay } from './WorldBossReplay';

type ActionRes = { status: 'success' } | { status: 'error'; message: string };
const FAIL = '지금은 처리할 수 없어요. 잠시 후 다시 시도해 주세요.';

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
  /** 보스 전용 배경(불씨가 남은 숲) — 히어로와 전투 재생 무대에 함께 쓴다. */
  bgSrc: string;
}) {
  const { showError, showHeaderToast } = useResourceToast();
  const [pending, start] = useTransition();
  // 떠난 보스는 모집이 끝났으니 출발 탭을 먼저 연다(리뷰 10-08).
  const [tab, setTab] = useState<'recruiting' | 'departed'>(d.status === 'active' ? 'recruiting' : 'departed');
  const [departAsk, setDepartAsk] = useState(false);
  const [replay, setReplay] = useState<WorldBossBattle | null>(null);
  const departKey = useRef<string | null>(null); // 출발 멱등 키 — 재전송해도 같은 결과(서버 depart_key)

  const active = d.status === 'active';
  const me = d.me;
  const mp = d.myParty;
  const recruiting = useMemo(() => d.parties.filter((p) => p.status === 'recruiting' && p.id !== mp?.partyId), [d.parties, mp]);
  const departed = useMemo(() => d.parties.filter((p) => p.status === 'departed').sort((a, b) => b.damage - a.damage), [d.parties]);
  const pendingParty = me?.pendingPartyId ? d.parties.find((p) => p.id === me.pendingPartyId) : undefined;
  const pct = d.need > 0 ? Math.min(100, (d.into / d.need) * 100) : 0;
  const owner = active ? d.ownerGuildName : d.settledGuildName;

  const run = (fn: () => Promise<ActionRes>, ok?: { title: string; detail?: string }) =>
    start(async () => {
      const r = await fn().catch(() => ({ status: 'error' as const, message: FAIL }));
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
      if (!r) return showError(FAIL);
      if (r.status === 'error') return showError(r.message);
      const f = r.result.finale;
      if (!f) return;
      const avatars: WorldBossBattle['avatars'] = {};
      for (const m of mp.members) avatars[m.userId] = { src: m.avatarSrc, box: m.faceBox };
      setReplay({
        partyId: r.result.partyId,
        leaderNickname: mp.members.find((m) => m.isLeader)?.nickname ?? '',
        finale: f,
        stageFrom: r.result.stageFrom,
        stageTo: r.result.stageTo,
        reward: r.result.reward,
        avatars,
      });
    });
  };

  const openBattle = (partyId: string) =>
    start(async () => {
      const r = await getBattleAction(partyId).catch(() => null);
      if (!r) return showError(FAIL);
      if (r.status === 'error') return showError(r.message);
      setReplay(r.battle);
    });

  return (
    <div className="flex-1 pb-24">
      {/* 히어로 — 보스 무대(불씨가 남은 숲, 2026-10-09 출현 구역 배경에서 교체) + 보스 그림 + 이름·구역·주인·남은 시간 */}
      <div className="relative h-[150px] overflow-hidden bg-zinc-950">
        <WorldBossBackdrop bgSrc={bgSrc} emberSrc={assetUrl(worldBossBgEmberUrl())} />
        <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/40 to-black/10" />
        <BackFab fallback="/guild/map" className="absolute left-3 top-3 z-10" />
        {active ? (
          <WorldBossSprite
            region={d.region}
            alt={d.name}
            className="absolute bottom-2 left-3 h-24 w-24"
            style={{ filter: 'drop-shadow(0 0 1px #000) drop-shadow(0 0 1px #000) drop-shadow(0 0 10px rgba(251,191,36,0.6))' }}
          />
        ) : (
          // 떠난 보스는 정지 그림을 흐리게(움직이면 아직 머무는 것처럼 읽힌다).
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={spriteSrc}
            alt={d.name}
            className="absolute bottom-2 left-3 h-24 w-24 object-contain opacity-60 grayscale"
            style={{ imageRendering: 'pixelated', filter: 'drop-shadow(0 0 1px #000) drop-shadow(0 0 1px #000)' }}
          />
        )}
        <div className="absolute bottom-3 left-[118px] right-3 flex flex-col">
          <h1 className="truncate text-[19px] font-extrabold text-amber-200 drop-shadow-[0_1px_3px_rgba(0,0,0,0.95)]">{d.name}</h1>
          <p className="truncate text-[11px] text-zinc-200 drop-shadow-[0_1px_2px_rgba(0,0,0,0.95)]">
            {d.zoneName}
            {active ? (owner ? ` · ${owner} 땅 · ` : ' · 주인 없음 · ') : ' · '}
            {active ? (
              <Ticker intervalMs={60_000}>{(now) => <span className="text-amber-300">{remain(d.leaveAt - now)}</span>}</Ticker>
            ) : (
              <span className="text-zinc-400">떠났어요</span>
            )}
          </p>
        </div>
      </div>

      {/* 단계 · 전리품 — 한 장 */}
      <div className="mx-3 mt-3 rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2.5">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-[11px] text-zinc-500">{active ? '지금' : '최종'}</span>
          <span className="text-[11px] text-zinc-500">쌓인 전리품</span>
        </div>
        <div className="flex items-baseline justify-between gap-2">
          <b className="text-[22px] font-black text-amber-300">{d.stage}단계</b>
          <b className="text-[16px] font-extrabold text-amber-200">
            💎{won(d.lootDiamond)} 📦{d.lootBoxes}
          </b>
        </div>
        {active && (
          <>
            <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-amber-900/40">
              <div className="h-full rounded-full bg-gradient-to-r from-amber-500 to-yellow-300" style={{ width: `${pct}%` }} />
            </div>
            <div className="mt-1 flex justify-between text-[10.5px] text-zinc-500">
              <span>{d.stage + 1}단계까지</span>
              <span className="font-mono tabular-nums">
                {formatCompactKR(d.into)} / {formatCompactKR(d.need)}
              </span>
            </div>
          </>
        )}
        <p className="mt-1.5 border-t border-zinc-800 pt-1.5 text-[11px] text-zinc-400">
          {active
            ? owner
              ? `보스가 떠나는 순간 ${d.zoneName}을 가진 길드의 금고로 들어가요. 지금은 ${owner}예요.`
              : '지금은 주인이 없어 원정대를 만들 수 없어요. 떠날 때도 주인이 없으면 전리품은 사라져요.'
            : owner
              ? josa(`${owner} 금고에 전리품을 남기고 떠났어요. 누적 피해 ${formatCompactKR(d.totalDamage)}.`)
              : '떠날 때 주인이 없어 전리품은 사라졌어요.'}
        </p>
      </div>

      {/* 약점 · 내 장착 */}
      {active && (
        <WeakPanel
          phase={d.phase}
          weakKnown={d.weakKnown}
          weakTotal={d.weakTotal}
          mine={d.mine}
          pending={pending}
          onEquipBest={() => run(() => equipBestAction(d.id), { title: '약점에 맞춰 장착했어요' })}
        />
      )}

      {/* 지금 할 일 — 상태별 */}
      {active && !mp && (
        <div className="mx-3 mt-3">
          {!me ? (
            <Notice>로그인하면 원정대에 참가할 수 있어요.</Notice>
          ) : me.state === 'pending' ? (
            <div className="flex items-center gap-2 rounded-xl border border-amber-500/45 bg-amber-950/30 px-3 py-2.5">
              <span className="min-w-0 flex-1 text-[12px] text-amber-100">
                <b>{pendingParty ? `${pendingParty.leaderNickname} 원정대` : '원정대'}</b>에 신청했어요
                <span className="block text-[10.5px] text-amber-200/70">대장이 수락하면 알림으로 알려 드려요</span>
              </span>
              <button
                type="button"
                disabled={pending}
                onClick={() => me.pendingPartyId && run(() => cancelRequestAction(d.id, me.pendingPartyId!), { title: '신청을 취소했어요' })}
                className="shrink-0 rounded-lg border border-amber-500/45 bg-zinc-900 px-3 py-1.5 text-[11.5px] font-bold text-amber-300 disabled:opacity-40"
              >
                신청 취소
              </button>
            </div>
          ) : me.canCreate ? (
            <div>
              <button
                type="button"
                disabled={pending}
                onClick={() => run(() => createPartyAction(d.id), { title: '원정대를 만들었어요', detail: '함께 갈 사람을 기다려요' })}
                className="w-full rounded-xl bg-amber-500 py-3 text-[14px] font-extrabold text-amber-950 disabled:opacity-40"
              >
                원정대 만들기
              </button>
              <p className="mt-1 text-center text-[10.5px] text-zinc-500">우리 땅의 보스예요 · 최대 10명 · 보스 하나에 1번</p>
            </div>
          ) : me.state === 'fought' ? (
            <Notice>이 보스와는 이미 싸웠어요. 보스 하나에 1번만 참가할 수 있어요.</Notice>
          ) : (
            <Notice>
              {owner ? `원정대 만들기는 ${owner} 길드원만 할 수 있어요. ` : ''}
              {recruiting.length > 0 ? '아래 모집 중 원정대에 신청해 보세요.' : '원정대가 생기면 여기에서 신청할 수 있어요.'}
            </Notice>
          )}
        </div>
      )}

      {/* 내 원정대 패널 */}
      {mp && (
        <section className="mx-3 mt-3 rounded-xl border border-amber-500/45 bg-zinc-900 p-3">
          <div className="mb-2 flex items-center gap-1.5">
            <b className="text-[13px] text-zinc-100">내 원정대</b>
            <span className={`rounded-full px-1.5 py-px text-[9.5px] font-extrabold ${mp.isLeader ? 'bg-amber-500 text-amber-950' : 'bg-zinc-700 text-zinc-200'}`}>
              {mp.isLeader ? '대장' : '원정대원'}
            </span>
            <span className="ml-auto font-mono text-[11px] font-extrabold tabular-nums text-amber-300">
              {mp.members.length}/{WORLD_BOSS_PARTY_MAX}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {mp.members.map((m) => (
              <MemberChip key={m.userId} p={m} serverId={serverId} leader={m.isLeader} />
            ))}
            {mp.status === 'recruiting' &&
              Array.from({ length: Math.max(0, Math.min(2, WORLD_BOSS_PARTY_MAX - mp.members.length)) }, (_, i) => (
                <div key={`e${i}`} className="flex h-10 items-center justify-center rounded-lg border border-dashed border-zinc-700 text-[10.5px] text-zinc-600">
                  빈 자리
                </div>
              ))}
          </div>

          {mp.isLeader && mp.status === 'recruiting' && mp.requests.length > 0 && (
            <div className="mt-2.5 border-t border-dashed border-zinc-700 pt-2">
              <b className="text-[11px] text-amber-300">신청 {mp.requests.length}건</b>
              {mp.requests.map((r) => (
                <div key={r.userId} className="mt-1.5 flex items-center gap-2">
                  <Avatar src={r.avatarSrc} box={r.faceBox} size="h-8 w-8 rounded-full bg-zinc-800" />
                  <span className="min-w-0 flex-1 truncate text-[12px] text-zinc-200">
                    {r.nickname}
                    <span className="ml-1 text-[10px] text-zinc-500">
                      {r.guildName ?? '무소속'} · {formatCompactKR(r.combat)}{r.weakCount > 0 && <span className="text-amber-400"> · 약점 {r.weakCount}</span>}
                    </span>
                  </span>
                  <button
                    type="button"
                    disabled={pending || mp.members.length >= WORLD_BOSS_PARTY_MAX}
                    onClick={() => run(() => decideJoinAction(d.id, mp.partyId, r.userId, true))}
                    className="rounded-md bg-amber-500 px-2.5 py-1 text-[11px] font-bold text-amber-950 disabled:opacity-40"
                  >
                    수락
                  </button>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => run(() => decideJoinAction(d.id, mp.partyId, r.userId, false))}
                    className="rounded-md bg-zinc-800 px-2.5 py-1 text-[11px] font-bold text-zinc-400 disabled:opacity-40"
                  >
                    거절
                  </button>
                </div>
              ))}
            </div>
          )}

          {mp.status === 'recruiting' ? (
            <>
              <p className="mt-2.5 text-[10.5px] text-zinc-400">
                {mp.isLeader ? (
                  <>
                    지금 {mp.members.length}명이면 1명당 평균 <b className="text-amber-300">{fmtAvg(worldBossExpectedAttacks(mp.members.length))}번</b> 공격해요
                    {mp.members.length < WORLD_BOSS_PARTY_MAX && ` · 10명이면 ${fmtAvg(worldBossExpectedAttacks(WORLD_BOSS_PARTY_MAX))}번`}
                  </>
                ) : (
                  '대장이 출발을 누르면 바로 싸워요. 결과와 보상은 우편으로 와요.'
                )}
              </p>
              {mp.isLeader ? (
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => run(() => leavePartyAction(d.id, mp.partyId), { title: '원정대를 해산했어요' })}
                    className="rounded-lg border border-zinc-700 px-3 py-2.5 text-[12px] font-bold text-zinc-400 disabled:opacity-40"
                  >
                    해산
                  </button>
                  <button
                    type="button"
                    disabled={pending || !active}
                    onClick={() => (mp.members.length < WORLD_BOSS_PARTY_MAX ? setDepartAsk(true) : depart())}
                    className="flex-1 rounded-lg bg-amber-500 py-2.5 text-[13.5px] font-extrabold text-amber-950 disabled:opacity-40"
                  >
                    출발
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => run(() => leavePartyAction(d.id, mp.partyId), { title: '원정대에서 나왔어요' })}
                  className="mt-2 w-full rounded-lg border border-zinc-700 py-2 text-[12px] font-bold text-zinc-400 disabled:opacity-40"
                >
                  나가기
                </button>
              )}
            </>
          ) : (
            (() => {
              const card = d.parties.find((p) => p.id === mp.partyId);
              return card ? (
                <div className="mt-2.5 rounded-lg bg-amber-950/40 px-2.5 py-2">
                  <DepartedSummary p={card} />
                  <button
                    type="button"
                    onClick={() => openBattle(card.id)}
                    disabled={pending}
                    className="mt-2 w-full rounded-lg border border-amber-500/50 py-2 text-[12px] font-bold text-amber-300 disabled:opacity-40"
                  >
                    내 전투 다시 보기
                  </button>
                </div>
              ) : null;
            })()
          )}
        </section>
      )}

      {/* 원정대 목록 — 모집 중 / 출발 */}
      <div className="mx-3 mt-4 flex gap-1 rounded-xl bg-zinc-900 p-1">
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
            <Empty
              title={!active ? '보스가 떠나 모집이 끝났어요' : '모집 중인 원정대가 없어요'}
              sub={
                !active
                  ? undefined
                  : me?.canCreate
                    ? '위에서 원정대를 만들면 다른 사람이 신청할 수 있어요.'
                    : owner
                      ? `${owner} 길드원이 원정대를 만들면 여기에 떠요.`
                      : undefined
              }
            />
          ) : (
            recruiting.map((p) => {
              const isPending = me?.pendingPartyId === p.id;
              const full = p.memberCount >= WORLD_BOSS_PARTY_MAX;
              const canRequest = active && me?.state === 'none' && !full;
              return (
                <div key={p.id} className={`rounded-xl border bg-zinc-900 p-2.5 ${isPending ? 'border-amber-500/55' : 'border-zinc-800'}`}>
                  <PartyHead p={p} />
                  <div className="my-1.5 flex gap-[3px]">
                    {Array.from({ length: WORLD_BOSS_PARTY_MAX }, (_, i) => (
                      <i key={i} className={`h-[5px] flex-1 rounded-sm ${i < p.memberCount ? 'bg-amber-500' : 'bg-zinc-800'}`} />
                    ))}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 text-[10.5px] text-zinc-400">
                      {full ? '가득 찼어요' : isPending ? '수락을 기다리는 중' : `지금 가면 1명당 평균 ${fmtAvg(worldBossExpectedAttacks(p.memberCount + 1))}번 공격`}
                    </span>
                    {canRequest && (
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => run(() => requestJoinAction(d.id, p.id), { title: '참가를 신청했어요', detail: '대장이 수락하면 알려 드려요' })}
                        className="rounded-lg bg-amber-500 px-3 py-1.5 text-[11.5px] font-bold text-amber-950 disabled:opacity-40"
                      >
                        참가 신청
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )
        ) : departed.length === 0 ? (
          <Empty title="아직 출발한 원정대가 없어요" />
        ) : (
          departed.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => openBattle(p.id)}
              disabled={pending}
              className={`rounded-xl border bg-zinc-900 p-2.5 text-left disabled:opacity-60 ${p.id === mp?.partyId ? 'border-amber-500/55' : 'border-zinc-800'}`}
            >
              <PartyHead p={p} />
              <DepartedSummary p={p} />
              <span className="mt-1 block text-right text-[10.5px] font-bold text-amber-300">전투 보기 ›</span>
            </button>
          ))
        )}
      </div>

      {/* 10명 미만 출발 확인 */}
      {departAsk && mp && (
        <ModalShell onClose={() => setDepartAsk(false)} onSubmit={depart} label="출발 확인">
          <ModalLayout
            title="지금 출발할까요?"
            subtitle={`원정대 ${mp.members.length}명`}
            footer={
              <>
                <ModalButton onClick={() => setDepartAsk(false)}>더 기다리기</ModalButton>
                <ModalButton tone="primary" grow={2} onClick={depart} disabled={pending}>
                  출발
                </ModalButton>
              </>
            }
          >
            <p className="text-[12.5px] leading-relaxed text-zinc-600 dark:text-zinc-300">
              사람이 많을수록 다 같이 오래 버텨요. 10명이 모이면 한 사람이 평균 {fmtAvg(worldBossExpectedAttacks(WORLD_BOSS_PARTY_MAX))}번,
              지금은 {fmtAvg(worldBossExpectedAttacks(mp.members.length))}번 공격할 수 있어요.
            </p>
            <p className="mt-1.5 text-[11.5px] text-zinc-500">출발하면 되돌릴 수 없어요.</p>
          </ModalLayout>
        </ModalShell>
      )}

      {replay && <WorldBossReplay battle={replay} bossName={d.name} bgSrc={bgSrc} onClose={() => setReplay(null)} />}
    </div>
  );
}

function Notice({ children }: { children: React.ReactNode }) {
  return <p className="rounded-xl border border-zinc-800 bg-zinc-900/70 px-3 py-2.5 text-[11.5px] leading-relaxed text-zinc-400">{children}</p>;
}

function Empty({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-dashed border-zinc-800 px-3 py-4 text-center">
      <p className="text-[12px] text-zinc-400">{title}</p>
      {sub && <p className="mt-0.5 text-[10.5px] text-zinc-600">{sub}</p>}
    </div>
  );
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

/** 출발한 원정대 요약 — 두 줄(리뷰 10-08: 한 줄에 몰려 빽빽했다). */
function DepartedSummary({ p }: { p: WorldBossPartyCard }) {
  const moved = (p.stageTo ?? 0) - (p.stageFrom ?? 0);
  return (
    <div className="mt-1">
      <p className="text-[11px] text-zinc-300">
        피해 <b className="text-amber-200">{formatCompactKR(p.damage)}</b> · {p.rounds}라운드 ·{' '}
        {moved > 0 ? (
          <>
            {p.stageFrom}→<b className="text-amber-300">{p.stageTo}단계</b>
          </>
        ) : (
          '단계 그대로'
        )}
      </p>
      <p className="mt-0.5 text-[10.5px] text-zinc-500">
        원정대 획득 💎{p.rewardDiamond.toLocaleString('ko-KR')} 📦{p.rewardBoxes.toLocaleString('ko-KR')}
      </p>
    </div>
  );
}

function MemberChip({ p, serverId, leader }: { p: WorldBossPerson; serverId: number; leader: boolean }) {
  const body = (
    <>
      <Avatar src={p.avatarSrc} box={p.faceBox} size="h-8 w-8 rounded-full bg-zinc-800" />
      <span className="min-w-0 flex-1 leading-tight">
        <span className="block truncate text-[11.5px] font-bold text-zinc-100">
          {leader && <span className="mr-0.5 text-amber-300">★</span>}
          {p.nickname}
        </span>
        <span className="block truncate text-[9.5px] text-zinc-500">
          {p.guildName ?? '무소속'} · {formatCompactKR(p.combat)}{p.weakCount > 0 && <span className="text-amber-400"> · 약점 {p.weakCount}</span>}
        </span>
      </span>
    </>
  );
  const cls = `flex h-10 items-center gap-1.5 rounded-lg px-1.5 ${leader ? 'bg-amber-950/50 ring-1 ring-amber-500/40' : 'bg-zinc-800/60'}`;
  return p.code ? (
    <Link prefetch={false} href={profileHref(p.code, serverId)} className={cls}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}
