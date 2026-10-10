'use client';

/**
 * 월드보스 상세 화면(docs/WORLD-BOSS.md §9). 위에서부터: 무대 히어로(이름·단계·전리품·남은 시간을 무대 안에) · 전리품 안내 한 줄 ·
 * 약점/내 장착 · 지금 할 일(신청 대기·안내) · 내 원정대 · [모집 중 | 완료] 원정대 카드, 그리고 지금 누를 버튼 하나를 바닥에 고정한다
 * (만들기 / 출발 / 내 전투 다시 보기). 고정 버튼은 채팅 미니바 높이(--chat-dock-h)만큼 띄워 가리지 않는다. 액션은 서버 액션이 현재 경로를 재렌더해 새 상태가 props로 온다
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
import { WORLD_BOSS_PARTY_INTRO_MAX, WORLD_BOSS_PARTY_MAX } from '@/lib/game/guild/balance';
import { profileHref } from '@/lib/game/profile/href';
import { formatCompactKR } from '@/lib/ui/format-number';
import type { WorldBossBattle, WorldBossDetail, WorldBossPartyCard, WorldBossPerson } from '@/lib/game/world-boss/view-types';
import { worldBossBgEmberUrl } from '@/lib/game/world-boss/bosses';
import { assetUrl } from '@/lib/asset-versions';

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
  if (m <= 0) return '곧 원정 종료';
  const h = Math.floor(m / 60);
  return h > 0 ? `종료까지 ${h}시간 ${m % 60}분` : `종료까지 ${m}분`;
}
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
  // 원정대 만들기 — 소개글(선택) 한 줄을 받는 팝업(10-10 사용자).
  const [createAsk, setCreateAsk] = useState(false);
  const [intro, setIntro] = useState('');
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
  const myCard = mp ? d.parties.find((p) => p.id === mp.partyId) : undefined;

  const run = (fn: () => Promise<ActionRes>, ok?: { title: string; detail?: string }) =>
    start(async () => {
      const r = await fn().catch(() => ({ status: 'error' as const, message: FAIL }));
      if (r.status === 'error') return showError(r.message);
      if (ok) showHeaderToast({ icon: '⚔️', ...ok });
    });

  const create = () => {
    setCreateAsk(false);
    run(() => createPartyAction(d.id, intro), { title: '원정대를 만들었어요', detail: '함께 갈 사람을 기다려요' });
  };

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
    <div className="flex-1 pb-4">
      {/* 히어로 — 무대(B안, 10-10): 보스 가운데 · 위 이름 · 아래 단계/진행률/전리품/남은 시간. 색은 보스 팔레트(잿빛 + 불씨 주황). */}
      <div className="relative h-[200px] overflow-hidden bg-stone-950">
        <WorldBossBackdrop bgSrc={bgSrc} emberSrc={assetUrl(worldBossBgEmberUrl())} className={active ? '' : 'grayscale opacity-70'} />
        <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(12,10,9,0.6)_0%,transparent_30%,transparent_55%,rgba(12,10,9,0.95)_100%)]" />
        <BackFab fallback="/guild/map" className="absolute left-3 top-3 z-10" />
        {active ? (
          <WorldBossSprite
            region={d.region}
            alt={d.name}
            className="absolute left-1/2 top-[46%] z-[1] h-[132px] w-[132px] -translate-x-1/2 -translate-y-1/2"
            style={{ filter: 'drop-shadow(0 0 1px #000) drop-shadow(0 0 1px #000) drop-shadow(0 0 10px rgba(234,88,12,0.6))' }}
          />
        ) : (
          // 원정이 끝난 보스는 정지 그림을 흐리게(움직이면 아직 머무는 것처럼 읽힌다).
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={spriteSrc}
            alt={d.name}
            className="absolute left-1/2 top-[46%] z-[1] h-[132px] w-[132px] -translate-x-1/2 -translate-y-1/2 object-contain opacity-60 grayscale"
            style={{ imageRendering: 'pixelated', filter: 'drop-shadow(0 0 1px #000) drop-shadow(0 0 1px #000)' }}
          />
        )}
        <div className="absolute left-[52px] right-3 top-3 z-[2] flex flex-col">
          <span className="flex items-center gap-1.5">
            <span className={`rounded-[4px] px-1 text-[9px] font-extrabold leading-[1.5] ${active ? 'bg-orange-700/90 text-orange-50' : 'bg-stone-700 text-stone-200'}`}>
              {active ? '월드보스' : '원정 종료'}
            </span>
            <h1 className="truncate text-[17px] font-extrabold text-stone-100 [text-shadow:0_1px_3px_#000]">{d.name}</h1>
          </span>
          <span className="truncate text-[11px] text-stone-300 [text-shadow:0_1px_2px_#000]">
            {d.zoneName}
            {owner ? ` · ${owner} 땅` : ' · 주인 없음'}
          </span>
        </div>
        <div className="absolute inset-x-3 bottom-2.5 z-[2] flex items-end justify-between gap-2">
          <span className="flex flex-col">
            <b className={`text-[28px] font-black leading-none [text-shadow:0_1px_3px_#000] ${active ? 'text-orange-400' : 'text-stone-300'}`}>
              {active ? `${d.stage}단계` : `최종 ${d.stage}단계`}
            </b>
            {active && (
              <span className="mt-1 text-[10.5px] text-stone-300 [text-shadow:0_1px_2px_#000]">
                {d.stage + 1}단계까지 <b className="text-orange-300">{Math.floor(pct)}%</b>
              </span>
            )}
          </span>
          <span className="flex flex-col items-end">
            <b className="text-[13px] font-extrabold text-stone-100 [text-shadow:0_1px_2px_#000]">
              💎{won(d.lootDiamond)} 📦{d.lootBoxes}
            </b>
            {active ? (
              <Ticker intervalMs={60_000}>{(now) => <span className="text-[10.5px] text-stone-300 [text-shadow:0_1px_2px_#000]">{remain(d.leaveAt - now)}</span>}</Ticker>
            ) : (
              <span className="text-[10.5px] text-stone-400">원정 종료</span>
            )}
          </span>
        </div>
      </div>
      {/* 전리품 안내 — 한 줄 */}
      <p className="mx-3 mt-2 text-[10.5px] leading-snug text-stone-400">
        {active
          ? owner
            ? josa(`원정이 종료되는 순간 쌓인 전리품이 ${d.zoneName}#{을} 가진 길드의 금고로 들어가요.`)
            : '지금은 주인이 없어 원정대를 만들 수 없어요. 종료 때도 주인이 없으면 전리품은 사라져요.'
          : owner
            ? josa(`${d.name}#{이} 재로 흩어지며 ${owner} 금고에 전리품을 남겼어요. 누적 피해 ${formatCompactKR(d.totalDamage)}.`)
            : '종료 때 주인이 없어 전리품은 사라졌어요.'}
      </p>

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
            <div className="flex items-center gap-2 rounded-xl border border-orange-500/45 bg-orange-950/30 px-3 py-2.5">
              <span className="min-w-0 flex-1 text-[12px] text-orange-100">
                <b>{pendingParty ? `${pendingParty.leaderNickname} 원정대` : '원정대'}</b>에 신청했어요
                <span className="block text-[10.5px] text-orange-200/70">원정대장이 수락하면 알림으로 알려 드려요</span>
              </span>
              <button
                type="button"
                disabled={pending}
                onClick={() => me.pendingPartyId && run(() => cancelRequestAction(d.id, me.pendingPartyId!), { title: '신청을 취소했어요' })}
                className="shrink-0 rounded-lg border border-orange-500/45 bg-stone-900 px-3 py-1.5 text-[11.5px] font-bold text-orange-300 disabled:opacity-40"
              >
                신청 취소
              </button>
            </div>
          ) : me.canCreate ? (
            <p className="text-center text-[10.5px] text-stone-500">우리 땅의 보스예요 · 최대 10명 · 보스 하나에 1번</p>
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
        <section className="mx-3 mt-3 rounded-xl border border-orange-500/45 bg-stone-900 p-3">
          <div className="mb-2 flex items-center gap-1.5">
            <b className="text-[13px] text-stone-100">내 원정대</b>
            <span className={`rounded-full px-1.5 py-px text-[9.5px] font-extrabold ${mp.isLeader ? 'bg-orange-700 text-orange-50' : 'bg-stone-700 text-stone-200'}`}>
              {mp.isLeader ? '원정대장' : '원정대원'}
            </span>
            <span className="ml-auto font-mono text-[11px] font-extrabold tabular-nums text-orange-300">
              {mp.members.length}/{WORLD_BOSS_PARTY_MAX}
            </span>
          </div>
          {myCard?.intro && <p className="-mt-1 mb-2 text-[11px] leading-snug text-stone-300">{myCard.intro}</p>}
          <div className="grid grid-cols-2 gap-1.5">
            {mp.members.map((m) => (
              <MemberChip key={m.userId} p={m} serverId={serverId} leader={m.isLeader} />
            ))}
            {mp.status === 'recruiting' &&
              Array.from({ length: Math.max(0, Math.min(2, WORLD_BOSS_PARTY_MAX - mp.members.length)) }, (_, i) => (
                <div key={`e${i}`} className="flex h-12 items-center justify-center rounded-lg border border-dashed border-stone-700 text-[10.5px] text-stone-600">
                  빈 자리
                </div>
              ))}
          </div>

          {mp.isLeader && mp.status === 'recruiting' && mp.requests.length > 0 && (
            <div className="mt-2.5 border-t border-dashed border-stone-700 pt-2">
              <b className="text-[11px] text-orange-300">신청 {mp.requests.length}건</b>
              {mp.requests.map((r) => (
                <div key={r.userId} className="mt-1.5 flex items-center gap-2">
                  <Body src={r.avatarSrc} h="h-10" />
                  <span className="min-w-0 flex-1 truncate text-[12px] text-stone-200">
                    {r.nickname}
                    <span className="ml-1 text-[10px] text-stone-500">
                      {r.guildName ?? '무소속'} · {formatCompactKR(r.combat)}{r.weakCount > 0 && <span className="text-orange-400"> · 약점 {r.weakCount}</span>}
                    </span>
                  </span>
                  <button
                    type="button"
                    disabled={pending || mp.members.length >= WORLD_BOSS_PARTY_MAX}
                    onClick={() => run(() => decideJoinAction(d.id, mp.partyId, r.userId, true))}
                    className="rounded-md bg-orange-700 px-2.5 py-1 text-[11px] font-bold text-orange-50 disabled:opacity-40"
                  >
                    수락
                  </button>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => run(() => decideJoinAction(d.id, mp.partyId, r.userId, false))}
                    className="rounded-md bg-stone-800 px-2.5 py-1 text-[11px] font-bold text-stone-400 disabled:opacity-40"
                  >
                    거절
                  </button>
                </div>
              ))}
            </div>
          )}

          {mp.status === 'recruiting' ? (
            <>
              {mp.isLeader ? (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => run(() => leavePartyAction(d.id, mp.partyId), { title: '원정대를 해산했어요' })}
                  className="mt-2 w-full rounded-lg border border-stone-700 py-2 text-[12px] font-bold text-stone-400 disabled:opacity-40"
                >
                  해산
                </button>
              ) : (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => run(() => leavePartyAction(d.id, mp.partyId), { title: '원정대에서 나왔어요' })}
                  className="mt-2 w-full rounded-lg border border-stone-700 py-2 text-[12px] font-bold text-stone-400 disabled:opacity-40"
                >
                  나가기
                </button>
              )}
            </>
          ) : (
            myCard && (
              <div className="mt-2.5 rounded-lg bg-orange-950/40 px-2.5 py-2">
                <DepartedSummary p={myCard} />
              </div>
            )
          )}
        </section>
      )}

      {/* 원정대 목록 — 모집 중 / 출발 */}
      <div className="mx-3 mt-4 flex gap-1 rounded-xl bg-stone-900 p-1">
        {(
          [
            ['recruiting', `모집 중 ${recruiting.length}`],
            // '완료' — 출발과 동시에 결과가 정해지므로 '출발'은 진행 중처럼 읽혔다(10-10 사용자). '종료'는 보스가 떠난 것과 겹쳐 피한다.
            ['departed', `완료 ${departed.length}`],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            aria-pressed={tab === k}
            className={`flex-1 rounded-lg py-1.5 text-[11.5px] font-bold ${tab === k ? 'bg-orange-700 text-orange-50' : 'text-stone-400'}`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="mx-3 mt-2 flex flex-col gap-2">
        {tab === 'recruiting' ? (
          recruiting.length === 0 ? (
            <Empty
              title={!active ? '원정이 종료돼 모집이 끝났어요' : '모집 중인 원정대가 없어요'}
              sub={
                !active
                  ? undefined
                  : me?.canCreate
                    ? '원정대를 만들면 다른 사람이 신청할 수 있어요.'
                    : undefined
              }
            />
          ) : (
            recruiting.map((p) => {
              const isPending = me?.pendingPartyId === p.id;
              const full = p.memberCount >= WORLD_BOSS_PARTY_MAX;
              const canRequest = active && me?.state === 'none' && !full;
              return (
                <div key={p.id} className={`rounded-xl border bg-stone-900 p-2.5 ${isPending ? 'border-orange-500/55' : 'border-stone-800'}`}>
                  <PartyHead p={p} />
                  {p.intro && <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-stone-300">{p.intro}</p>}
                  {/* 명단 — 대장 먼저, 이름 + 전투력(10-10 사용자: 누가 있는지·수치를 컴팩트하게). */}
                  {p.members.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {p.members.map((m) => (
                        <span key={m.userId} className="rounded-md bg-stone-800/80 px-1.5 py-0.5 text-[10px] leading-tight text-stone-300">
                          {m.isLeader && <span className="mr-0.5 text-orange-300">★</span>}
                          {m.nickname} <span className="text-stone-500">{formatCompactKR(m.combat)}</span>
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="my-1.5 flex gap-[3px]">
                    {Array.from({ length: WORLD_BOSS_PARTY_MAX }, (_, i) => (
                      <i key={i} className={`h-[5px] flex-1 rounded-sm ${i < p.memberCount ? 'bg-orange-700' : 'bg-stone-800'}`} />
                    ))}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 text-[10.5px] text-stone-400">
                      합산 전투력 <b className="text-orange-300">{formatCompactKR(p.combatSum)}</b>
                    </span>
                    {/* 신청한 원정대는 버튼이 '신청 완료'(비활성)로 바뀐다 — 취소는 위 신청 카드에서(10-10 사용자). */}
                    {isPending ? (
                      <button type="button" disabled className="rounded-lg bg-stone-800 px-3 py-1.5 text-[11.5px] font-bold text-stone-500">
                        신청 완료
                      </button>
                    ) : full ? (
                      <span className="text-[10.5px] text-stone-500">가득 찼어요</span>
                    ) : canRequest ? (
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => run(() => requestJoinAction(d.id, p.id), { title: '참가를 신청했어요', detail: '원정대장이 수락하면 알려 드려요' })}
                        className="rounded-lg bg-orange-700 px-3 py-1.5 text-[11.5px] font-bold text-orange-50 disabled:opacity-40"
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
          <Empty title="아직 완료된 원정대가 없어요" />
        ) : (
          departed.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => openBattle(p.id)}
              disabled={pending}
              className={`rounded-xl border bg-stone-900 p-2.5 text-left disabled:opacity-60 ${p.id === mp?.partyId ? 'border-orange-500/55' : 'border-stone-800'}`}
            >
              <PartyHead p={p} />
              <DepartedSummary p={p} />
              <span className="mt-1 block text-right text-[10.5px] font-bold text-orange-300">전투 보기 ›</span>
            </button>
          ))
        )}
      </div>

      {/* 하단 고정 — 지금 누를 버튼 하나(만들기 / 출발 / 내 전투 다시 보기). 스크롤해도 바닥에 붙는다. */}
      {(() => {
        // 종류만 고르고 실제 동작은 클릭 때 고른다(렌더 중 ref를 쥔 함수를 만들지 않도록).
        const kind: 'create' | 'depart' | 'replay' | null =
          active && !mp && me && me.state !== 'pending' && me.canCreate
            ? 'create'
            : mp?.isLeader && mp.status === 'recruiting' && active
              ? 'depart'
              : mp && mp.status !== 'recruiting' && myCard
                ? 'replay'
                : null;
        const go = () => {
          if (kind === 'create') setCreateAsk(true);
          // 출발은 인원과 무관하게 확인 팝업(명단·합산 전투력을 되읽어 준다, 10-10 사용자).
          else if (kind === 'depart' && mp) setDepartAsk(true);
          else if (kind === 'replay' && myCard) openBattle(myCard.id);
        };
        const c = kind && { label: kind === 'create' ? '원정대 만들기' : kind === 'depart' ? '출발' : '내 전투 다시 보기', sub: kind === 'depart' && mp ? `${mp.members.length}명` : '' };
        return c ? (
          <div style={{ bottom: 'var(--chat-dock-h, 0px)' }} className="sticky z-10 mt-3 bg-gradient-to-t from-stone-950 from-60% to-transparent px-3 pb-3 pt-5">
            <button
              type="button"
              disabled={pending}
              onClick={go}
              className="w-full rounded-xl bg-orange-700 py-3 text-[14px] font-extrabold text-orange-50 shadow-lg shadow-black/50 disabled:opacity-40"
            >
              {c.label}
              {c.sub && <span className="ml-1 text-[12px] font-bold text-orange-200/90">· {c.sub}</span>}
            </button>
          </div>
        ) : null;
      })()}

      {/* 출발 확인 — 명단·합산 전투력을 되읽어 준다. 버튼은 취소/출발 같은 크기(10-10 사용자). */}
      {departAsk && mp && (
        <ModalShell onClose={() => setDepartAsk(false)} onSubmit={depart} label="출발 확인">
          <ModalLayout
            title="지금 출발할까요?"
            subtitle={`원정대 ${mp.members.length}명`}
            maxBodyClass="max-h-[46vh]"
            footer={
              <>
                <ModalButton onClick={() => setDepartAsk(false)}>취소</ModalButton>
                <ModalButton tone="primary" onClick={depart} disabled={pending}>
                  출발
                </ModalButton>
              </>
            }
          >
            <ul className="space-y-1">
              {mp.members.map((m) => (
                <li key={m.userId} className="flex items-center justify-between gap-2 text-[12.5px]">
                  <span className="truncate text-stone-600 dark:text-stone-300">
                    {m.isLeader && <span className="mr-0.5 text-orange-500">★</span>}
                    {m.nickname}
                  </span>
                  <span className="shrink-0 font-mono font-bold tabular-nums">{formatCompactKR(m.combat)}</span>
                </li>
              ))}
            </ul>
            <p className="mt-2 flex items-center justify-between border-t border-zinc-200 pt-2 text-[12px] dark:border-zinc-700">
              <span className="text-stone-500">합산 전투력</span>
              <b className="font-mono tabular-nums text-orange-600 dark:text-orange-400">{formatCompactKR(mp.members.reduce((s, m) => s + m.combat, 0))}</b>
            </p>
            <p className="mt-1.5 text-[11.5px] text-stone-500">출발하면 되돌릴 수 없어요.</p>
          </ModalLayout>
        </ModalShell>
      )}

      {/* 원정대 만들기 — 소개글(선택) 한 줄 */}
      {createAsk && (
        <ModalShell onClose={() => setCreateAsk(false)} onSubmit={create} label="원정대 만들기">
          <ModalLayout
            title="원정대 만들기"
            subtitle="함께 갈 사람에게 보일 소개글을 적을 수 있어요 (선택)"
            footer={
              <>
                <ModalButton onClick={() => setCreateAsk(false)}>취소</ModalButton>
                <ModalButton tone="primary" onClick={create} disabled={pending}>
                  만들기
                </ModalButton>
              </>
            }
          >
            {/* 입력 글꼴 16px — iOS가 포커스 때 확대하지 않는 최소 크기(축소 기법은 모달 안에서 세로가 잘려 쓰지 않는다). */}
            <input
              autoFocus
              value={intro}
              onChange={(e) => setIntro(e.target.value)}
              maxLength={WORLD_BOSS_PARTY_INTRO_MAX}
              placeholder="예) 약점 장비 맞춘 분 환영해요"
              className="block w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-[16px] leading-tight text-zinc-900 outline-none placeholder:text-zinc-400 focus:border-amber-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-500"
            />
            <p className="mt-1 text-right text-[10.5px] tabular-nums text-stone-500">
              {intro.length}/{WORLD_BOSS_PARTY_INTRO_MAX}
            </p>
          </ModalLayout>
        </ModalShell>
      )}

      {replay && <WorldBossReplay battle={replay} bossName={d.name} bgSrc={bgSrc} onClose={() => setReplay(null)} />}
    </div>
  );
}

function Notice({ children }: { children: React.ReactNode }) {
  return <p className="rounded-xl border border-stone-800 bg-stone-900/70 px-3 py-2.5 text-[11.5px] leading-relaxed text-stone-400">{children}</p>;
}

function Empty({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-dashed border-stone-800 px-3 py-4 text-center">
      <p className="text-[12px] text-stone-400">{title}</p>
      {sub && <p className="mt-0.5 text-[10.5px] text-stone-600">{sub}</p>}
    </div>
  );
}

function PartyHead({ p }: { p: WorldBossPartyCard }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <b className="truncate text-[12.5px] text-stone-100">{p.leaderNickname} 원정대</b>
      {p.guildName && <span className="truncate text-[10px] text-stone-500">{p.guildName}</span>}
      <span className="ml-auto shrink-0 font-mono text-[11px] font-extrabold tabular-nums text-orange-300">
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
      <p className="text-[11px] text-stone-300">
        피해 <b className="text-orange-200">{formatCompactKR(p.damage)}</b> · {p.rounds}라운드 ·{' '}
        {moved > 0 ? (
          <>
            <b className="text-orange-300">{p.stageTo}단계</b>까지 +{moved}
          </>
        ) : (
          '단계 그대로'
        )}
      </p>
      <p className="mt-0.5 text-[10.5px] text-stone-500">
        원정대 획득 💎{p.rewardDiamond.toLocaleString('ko-KR')} 📦{p.rewardBoxes.toLocaleString('ko-KR')}
      </p>
    </div>
  );
}

/** 전신 아바타(10-10 사용자: 얼굴 크롭 대신 전신) — 파견 카드와 같은 방식, south 그림을 칸 높이에 꽉 채워 바닥 정렬. */
function Body({ src, h }: { src: string | null; h: string }) {
  return (
    <span className={`flex ${h} w-9 shrink-0 items-end justify-center overflow-hidden`}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" decoding="async" draggable={false} className="h-full w-auto" style={{ imageRendering: 'pixelated' }} />
      ) : (
        <span className="pb-1 text-base">👤</span>
      )}
    </span>
  );
}

function MemberChip({ p, serverId, leader }: { p: WorldBossPerson; serverId: number; leader: boolean }) {
  const body = (
    <>
      <Body src={p.avatarSrc} h="h-12" />
      <span className="min-w-0 flex-1 leading-tight">
        <span className="block truncate text-[11.5px] font-bold text-stone-100">
          {leader && <span className="mr-0.5 text-orange-300">★</span>}
          {p.nickname}
        </span>
        <span className="block truncate text-[9.5px] text-stone-500">
          {p.guildName ?? '무소속'} · {formatCompactKR(p.combat)}{p.weakCount > 0 && <span className="text-orange-400"> · 약점 {p.weakCount}</span>}
        </span>
      </span>
    </>
  );
  const cls = `flex h-12 items-center gap-1.5 rounded-lg pl-1 pr-1.5 ${leader ? 'bg-orange-950/50 ring-1 ring-orange-500/40' : 'bg-stone-800/60'}`;
  return p.code ? (
    <Link prefetch={false} href={profileHref(p.code, serverId)} className={cls}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}
