'use client';

/**
 * 월드보스 상세 화면(docs/WORLD-BOSS.md §9). 위에서부터: 무대 히어로(이름·단계·전리품·남은 시간을 무대 안에) · 전리품 안내 한 줄 ·
 * 약점/내 장착 · 지금 할 일(원정대 만들기 / 신청 대기 / 안내) · 내 원정대(출발·해산·나가기·내 전투 다시 보기는 패널 안) · [모집 중 | 완료] 원정대 카드.
 * 바닥 고정 버튼은 두지 않는다(채팅 미니바 위에 떠서 어색했다, 10-10 사용자).
 * 액션은 모두 **낙관적**(useOptimistic): 누르는 즉시 화면을 바꾸고 서버 액션이 현재 경로를 재렌더해 확정된 상태가 props로 온다(실패하면 토스트 + 자동 복귀).
 * (router.refresh 없음, CLAUDE §11.7). 출발만은 결과가 서버 RNG라 낙관 없이 기다렸다가 WorldBossReplay로 재생.
 */
import Link from 'next/link';
import { josa } from 'josa';
import { useMemo, useOptimistic, useRef, useState, useTransition } from 'react';

import { BackFab } from '@/components/BackNav';
import { meleeFaceCropStyle } from '@/components/faceCrop';
import { GuildBadge } from '@/components/GuildBadge';
import { ModalLayout, ModalButton } from '@/components/ModalLayout';
import { ModalShell } from '@/components/ModalShell';
import { useResourceToast } from '@/components/ResourceToast';
import { Ticker } from '@/components/Ticker';
import { WorldBossBackdrop } from '@/components/WorldBossBackdrop';
import { WorldBossSprite } from '@/components/WorldBossSprite';
import { WORLD_BOSS_AVATAR_BONUS, WORLD_BOSS_PARTY_INTRO_MAX, WORLD_BOSS_PARTY_MAX, type WorldBossTraitCode, worldBossPartyTraitMult, worldBossPartyTraitStatus, worldBossTraitDef } from '@/lib/game/guild/balance';
import { profileHref } from '@/lib/game/profile/href';
import { formatCompactKR } from '@/lib/ui/format-number';
import type { WorldBossBattle, WorldBossDetail, WorldBossMyParty, WorldBossPartyCard, WorldBossPerson } from '@/lib/game/world-boss/view-types';
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
  respondInviteAction,
} from '../actions';
import { Avatar } from '../../friends/Avatar';
import { InviteSheet } from './InviteSheet';
import { LeaderChip } from './LeaderChip';
import { WeakPanel } from './WeakPanel';
import { WorldBossReplay } from './WorldBossReplay';

type ActionRes = { status: 'success' } | { status: 'error'; message: string };
const FAIL = '지금은 처리할 수 없어요. 잠시 후 다시 시도해 주세요.';

/** 낙관적 패치 — 누르는 즉시 화면에 반영할 변화. 서버 재렌더가 오면 버려지고 확정 상태로 바뀐다. */
type Patch =
  | { t: 'request'; partyId: string }
  | { t: 'cancel'; partyId: string }
  | { t: 'decide'; userId: string; accept: boolean }
  | { t: 'leave' }
  | { t: 'create'; intro: string }
  | { t: 'equipBest' }
  | { t: 'respondInvite'; partyId: string };

const OPT_PARTY_ID = 'opt-create';

function applyPatch(s: WorldBossDetail, p: Patch): WorldBossDetail {
  const me = s.me;
  const active = s.status === 'active';
  switch (p.t) {
    case 'request':
      if (!me) return s;
      return { ...s, me: { ...me, state: 'pending', pendingPartyIds: [...me.pendingPartyIds, p.partyId], canCreate: false } };
    case 'cancel': {
      if (!me) return s;
      const ids = me.pendingPartyIds.filter((x) => x !== p.partyId);
      const state = ids.length > 0 ? 'pending' : 'none';
      return { ...s, me: { ...me, state, pendingPartyIds: ids, canCreate: active && me.isOwnerGuild && state === 'none' } };
    }
    case 'decide': {
      const mp = s.myParty;
      if (!mp) return s;
      const req = mp.requests.find((r) => r.userId === p.userId);
      const requests = mp.requests.filter((r) => r.userId !== p.userId);
      if (!p.accept || !req) return { ...s, myParty: { ...mp, requests } };
      return {
        ...s,
        myParty: { ...mp, requests, members: [...mp.members, { ...req, isLeader: false }] },
        parties: s.parties.map((c) =>
          c.id === mp.partyId
            ? {
                ...c,
                memberCount: c.memberCount + 1,
                members: [...c.members, { userId: req.userId, nickname: req.nickname, combat: req.combat, damage: 0, isLeader: false, guildEmblemUrl: req.guildEmblemUrl, guildEmblemColor: req.guildEmblemColor }],
                combatSum: c.combatSum + req.combat,
              }
            : c,
        ),
      };
    }
    case 'leave': {
      const mp = s.myParty;
      if (!mp || !me) return s;
      const parties = mp.isLeader
        ? s.parties.filter((c) => c.id !== mp.partyId)
        : s.parties.map((c) =>
            c.id === mp.partyId
              ? { ...c, memberCount: Math.max(0, c.memberCount - 1), members: c.members.filter((m) => m.userId !== me.userId), combatSum: c.combatSum - (c.members.find((m) => m.userId === me.userId)?.combat ?? 0) }
              : c,
          );
      return { ...s, parties, myParty: null, me: { ...me, state: 'none', pendingPartyIds: [], canCreate: active && me.isOwnerGuild } };
    }
    case 'create': {
      if (!me?.person) return s;
      const who = me.person;
      const intro = p.intro.replace(/\s+/g, ' ').trim().slice(0, WORLD_BOSS_PARTY_INTRO_MAX) || null;
      const card: WorldBossPartyCard = {
        id: OPT_PARTY_ID, status: 'recruiting', leaderNickname: who.nickname, guildName: who.guildName, guildEmblemUrl: who.guildEmblemUrl, guildEmblemColor: who.guildEmblemColor,
        intro, members: [{ userId: who.userId, nickname: who.nickname, combat: who.combat, damage: 0, isLeader: true, guildEmblemUrl: who.guildEmblemUrl, guildEmblemColor: who.guildEmblemColor }], combatSum: who.combat, memberCount: 1,
        createdAt: 0, departedAt: null, damage: 0, rounds: 0, stageFrom: null, stageTo: null, rewardDiamond: 0, rewardBoxes: 0, // 낙관 카드 — 시각은 서버 재렌더가 채운다(렌더 중 Date.now 금지)
      };
      return {
        ...s,
        parties: [...s.parties, card],
        myParty: { partyId: OPT_PARTY_ID, status: 'recruiting', isLeader: true, leaderUserId: me.userId, members: [{ ...who, isLeader: true }], requests: [], invites: [], myResult: null },
        me: { ...me, state: 'member', pendingPartyIds: [], canCreate: false },
      };
    }
    case 'respondInvite': {
      // 수락은 서버 재렌더가 내 원정대를 채운다(명단·장착을 여기서 만들 수 없다 — 낙관 적용 예외). 배너만 먼저 지운다.
      if (!me) return s;
      return { ...s, me: { ...me, invites: me.invites.filter((x) => x.partyId !== p.partyId) } };
    }
    case 'equipBest': {
      const mine = s.mine;
      if (!mine?.best) return s;
      const pieces = mine.best.pieces;
      return {
        ...s,
        mine: {
          loadout: { ...mine.loadout, pieces, power: mine.best.power, weakCount: pieces.filter((x) => x.weak).length, avatarCount: pieces.filter((x) => x.av).length },
          best: null,
        },
      };
    }
  }
}

function remain(ms: number): string {
  const m = Math.ceil(ms / 60_000);
  if (m <= 0) return '곧 원정 종료';
  const h = Math.floor(m / 60);
  return h > 0 ? `종료까지 ${h}시간 ${m % 60}분` : `종료까지 ${m}분`;
}
const won = (n: number) => n.toLocaleString('ko-KR');

export function WorldBossDetailView({
  detail,
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
  // 낙관적 상태 — 전환(start) 안에서 patch를 먼저 적용하고 서버 액션을 기다린다. 성공하면 재렌더된 detail이, 실패하면 원래 detail이 남는다.
  const [d, patch] = useOptimistic(detail, applyPatch);
  // 떠난 보스는 모집이 끝났으니 출발 탭을 먼저 연다(리뷰 10-08).
  const [tab, setTab] = useState<'recruiting' | 'departed'>(d.status === 'active' ? 'recruiting' : 'departed');
  const [departAsk, setDepartAsk] = useState(false);
  // 원정대 만들기 — 소개글(선택) 한 줄을 받는 팝업(10-10 사용자).
  const [createAsk, setCreateAsk] = useState(false);
  const [intro, setIntro] = useState('');
  const [traitSheet, setTraitSheet] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [replay, setReplay] = useState<WorldBossBattle | null>(null);
  const departKey = useRef<string | null>(null); // 출발 멱등 키 — 재전송해도 같은 결과(서버 depart_key)

  const active = d.status === 'active';
  const me = d.me;
  const mp = d.myParty;
  // 초대받은 원정대(10-11, 레이드 방식)는 맨 앞 — 신청·수락 없이 '참가'로 바로 들어간다.
  const invitedIds = useMemo(() => new Set((me?.invites ?? []).map((i) => i.partyId)), [me]);
  const recruiting = useMemo(
    () => d.parties.filter((p) => p.status === 'recruiting' && p.id !== mp?.partyId).sort((a, b) => Number(invitedIds.has(b.id)) - Number(invitedIds.has(a.id))),
    [d.parties, mp, invitedIds],
  );
  const departed = useMemo(() => d.parties.filter((p) => p.status === 'departed').sort((a, b) => b.damage - a.damage), [d.parties]);
  // 다음 페이즈까지 남은 피해 — %가 아니라 남은 수치로(10-11 사용자: 모든 '%' 표기는 남은 양으로). 화면 용어는 레이드처럼 '페이즈'(코드의 stage, 10-11).
  const remainHp = Math.max(0, d.need - d.into);
  const owner = active ? d.ownerGuildName : d.settledGuildName;
  const ownerEmblem = active ? d.ownerGuildEmblem : d.settledGuildEmblem;
  const myCard = mp ? d.parties.find((p) => p.id === mp.partyId) : undefined;
  // 구성 특성이 지금 내 원정대에 얼마나 적용되는지(출발 순간 서버가 같은 함수로 계산한다).
  const traitCodes = useMemo(() => d.traits.map((t) => t.code as WorldBossTraitCode), [d.traits]);
  const traitStatus = useMemo(() => (mp ? worldBossPartyTraitStatus(traitCodes, mp.members.map((m) => ({ guild: m.guildName }))) : []), [traitCodes, mp]);
  const partyMult = useMemo(() => (mp ? worldBossPartyTraitMult(traitCodes, mp.members.map((m) => ({ guild: m.guildName }))) : 1), [traitCodes, mp]);

  const run = (fn: () => Promise<ActionRes>, ok?: { title: string; detail?: string }, p?: Patch) =>
    start(async () => {
      if (p) patch(p);
      const r = await fn().catch(() => ({ status: 'error' as const, message: FAIL }));
      if (r.status === 'error') return showError(r.message);
      if (ok) showHeaderToast({ icon: '⚔️', ...ok });
    });

  const create = () => {
    setCreateAsk(false);
    run(() => createPartyAction(d.id, intro), { title: '원정대를 만들었어요', detail: '함께 갈 사람을 기다려요' }, { t: 'create', intro });
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
            className="absolute left-1/2 top-1/2 z-[1] h-[132px] w-[132px] -translate-x-1/2 -translate-y-1/2"
            style={{ filter: 'drop-shadow(0 0 1px #000) drop-shadow(0 0 1px #000) drop-shadow(0 0 10px rgba(234,88,12,0.6))' }}
          />
        ) : (
          // 원정이 끝난 보스는 정지 그림을 흐리게(움직이면 아직 머무는 것처럼 읽힌다).
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={spriteSrc}
            alt={d.name}
            className="absolute left-1/2 top-1/2 z-[1] h-[132px] w-[132px] -translate-x-1/2 -translate-y-1/2 object-contain opacity-60 grayscale"
            style={{ imageRendering: 'pixelated', filter: 'drop-shadow(0 0 1px #000) drop-shadow(0 0 1px #000)' }}
          />
        )}
        <div className={`absolute left-[52px] top-3 z-[2] flex flex-col ${d.traits.length > 0 ? 'right-[104px]' : 'right-3'}`}>
          <span className="flex items-center gap-1.5">
            <span className={`rounded-[4px] px-1 text-[9px] font-extrabold leading-[1.5] ${active ? 'bg-orange-700/90 text-orange-50' : 'bg-stone-700 text-stone-200'}`}>
              {active ? '월드보스' : '원정 종료'}
            </span>
            <h1 className="truncate text-[17px] font-extrabold text-stone-100 [text-shadow:0_1px_3px_#000]">{d.name}</h1>
          </span>
          <span className="flex min-w-0 items-center gap-1 text-[11px] text-stone-300 [text-shadow:0_1px_2px_#000]">
            <span className="shrink-0">{d.zoneName} ·</span>
            {/* '○○ 땅' 대신 문양 + 길드 이름만(10-10 사용자) */}
            {owner ? (
              <GuildBadge emblemUrl={ownerEmblem?.url ?? null} emblemColor={ownerEmblem?.color ?? null} name={owner} size={12} className="min-w-0" />
            ) : (
              <span>주인 없음</span>
            )}
          </span>
        </div>
        {/* 특성 칩 — 히어로 우측 상단에 세로로(10-11 사용자: 이름 오른쪽은 이름을 밀어낸다). 탭하면 설명 시트. */}
        {d.traits.length > 0 && (
          <button type="button" onClick={() => setTraitSheet(true)} className="absolute right-3 top-3 z-[2] flex flex-col items-end gap-1" aria-label="보스 특성">
            {d.traits.map((t) => (
              <span key={t.code} className="inline-flex items-center gap-0.5 rounded-full border border-orange-500/50 bg-stone-900/85 px-1.5 py-px text-[10px] font-bold text-orange-200">
                <span aria-hidden>{t.icon}</span>
                {t.name}
              </span>
            ))}
          </button>
        )}
        <div className="absolute inset-x-3 bottom-2.5 z-[2] flex items-end justify-between gap-2">
          <span className="flex flex-col">
            <b className={`text-[28px] font-black leading-none [text-shadow:0_1px_3px_#000] ${active ? 'text-orange-400' : 'text-stone-300'}`}>
              {active ? `${d.stage}페이즈` : `최종 ${d.stage}페이즈`}
            </b>
            {active && (
              <span className="mt-1 text-[10.5px] text-stone-300 [text-shadow:0_1px_2px_#000]">
                다음 페이즈까지 <b className="text-orange-300">{formatCompactKR(remainHp)}</b>
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
          weakBonus={d.weakBonus}
          mine={d.mine}
          // me.person은 원정대 참가 전에만 채워진다(낙관 그리기용) — 참가 중이면 내 원정대 명단의 내 항목에서(10-11 사용자: 👤 노출 버그).
          avatarSrc={me?.person?.avatarSrc ?? mp?.members.find((x) => x.userId === me?.userId)?.avatarSrc ?? null}
          onEquipBest={() => run(() => equipBestAction(d.id), { title: '추천 장비를 장착했어요' }, { t: 'equipBest' })}
        />
      )}

      {/* 지금 할 일 — 상태별 */}
      {active && !mp && (
        <div className="mx-3 mt-3">
          {!me ? (
            <Notice>로그인하면 원정대에 참가할 수 있어요.</Notice>
          ) : me.canCreate ? (
            // 원정대 만들기 — 바닥 고정 대신 제자리에. 윤곽선(속이 빈 주황 테두리 + ＋) — '준비' 단계라 채운 버튼인 출발과 구분(10-10 사용자, A안).
            <button
              type="button"
              onClick={() => setCreateAsk(true)}
              className="w-full rounded-xl border border-orange-500/70 bg-transparent py-3 text-[14px] font-extrabold text-orange-300"
            >
              ＋ 원정대 만들기
            </button>
          ) : me.state === 'fought' ? (
            <Notice>이 보스와는 이미 싸웠어요. 보스 하나에 1번만 참가할 수 있어요.</Notice>
          ) : !me.isOwnerGuild && owner ? (
            // 신청 안내 문구는 두지 않는다(10-10 사용자) — 신청 상태는 각 모집 카드의 버튼이 보여 준다.
            <Notice>원정대 만들기는 {owner} 길드원만 할 수 있어요.</Notice>
          ) : null}
        </div>
      )}

      {/* 내 원정대 패널 */}
      {mp && (
        <section className="mx-3 mt-3 rounded-xl border border-orange-500/45 bg-stone-900 p-3">
          <div className="mb-2 flex items-center gap-1.5">
            {/* 이름은 모집 카드와 같은 '대장 닉네임 원정대'(10-10 사용자) */}
            <b className="truncate text-[13px] text-stone-100">{mp.members.find((m) => m.isLeader)?.nickname ?? myCard?.leaderNickname ?? ''} 원정대</b>
            <span className={`rounded-full px-1.5 py-px text-[9.5px] font-extrabold ${mp.isLeader ? 'bg-orange-700 text-orange-50' : 'bg-stone-700 text-stone-200'}`}>
              {mp.isLeader ? '원정대장' : '원정대원'}
            </span>
            <span className="ml-auto font-mono text-[11px] font-extrabold tabular-nums text-orange-300">
              {mp.members.length}/{WORLD_BOSS_PARTY_MAX}
            </span>
          </div>
          {myCard?.intro && <p className="-mt-1 mb-2 text-[11px] leading-snug text-stone-300">{myCard.intro}</p>}
          {/* 명단 — 둥근 얼굴 5×2(10-11 사용자 B안): 10칸을 늘 다 보여 빈 자리까지 한눈에. 원정대장은 주황 테두리 + 👑, 길드 문양은 얼굴 왼쪽 아래. 빈 자리는 점선 '+'(초대 기능은 논의 중). */}
          <div className="grid grid-cols-5 gap-x-1 gap-y-2.5">
            {/* 출발한 뒤엔 빈 자리를 그리지 않는다(10-11 사용자) — 대원만. */}
            {Array.from({ length: mp.status === 'departed' ? mp.members.length : WORLD_BOSS_PARTY_MAX }, (_, i) => {
              const m = mp.members[i];
              if (m) return <SlotPerson key={m.userId} p={m} serverId={serverId} leader={m.isLeader} />;
              const inv = mp.invites[i - mp.members.length];
              if (inv) return <SlotPerson key={`i${inv.userId}`} p={inv} serverId={serverId} leader={false} inviting />;
              // 빈 자리 — 대장은 눌러 초대(10-11 사용자 2안: 친구·길드원 목록에서 초대 → 상대 수락). 출발 뒤엔 그냥 표시.
              return <SlotEmpty key={`e${i}`} onClick={mp.isLeader && mp.status === 'recruiting' && mp.partyId !== OPT_PARTY_ID ? () => setInviteOpen(true) : undefined} />;
            })}
          </div>
          {/* 구성 특성 적용 상태 — 켜진 것은 초록, 아직인 것은 회색으로 조건(시안 ②). */}
          {/* 구성 특성 — 라벨만 켜짐/꺼짐으로(10-11 사용자: 설명 없이), 누르면 특성 설명 시트. 적용 배율·합산은 출발 팝업에서. */}
          {mp.status === 'recruiting' && traitStatus.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {traitStatus.map((s) => {
                const t = worldBossTraitDef(s.code)!;
                return (
                  <button
                    key={s.code}
                    type="button"
                    onClick={() => setTraitSheet(true)}
                    aria-pressed={s.active}
                    className={`rounded-md border px-1.5 py-0.5 text-[10px] font-bold ${s.active ? 'border-red-500/60 bg-red-500/15 text-red-300' : 'border-stone-700 bg-stone-800/60 text-stone-500'}`}
                  >
                    {t.icon} {t.name}
                  </button>
                );
              })}
            </div>
          )}

          {mp.isLeader && mp.status === 'recruiting' && mp.requests.length > 0 && (
            <div className="mt-2.5 border-t border-dashed border-stone-700 pt-2">
              <b className="text-[11px] text-orange-300">신청 {mp.requests.length}건</b>
              {mp.requests.map((r) => (
                <div key={r.userId} className="mt-1.5 flex items-center gap-2">
                  <Body src={r.avatarSrc} h="h-10" />
                  <span className="min-w-0 flex-1 leading-tight">
                    <span className="block truncate text-[12px] text-stone-200">{r.nickname}</span>
                    <span className="flex min-w-0 items-center gap-1 text-[10px] text-stone-500">
                      <Guild p={r} />
                      <span className="shrink-0">· {formatCompactKR(r.combat)}</span>
                    </span>
                  </span>
                  <button
                    type="button"
                    disabled={mp.members.length >= WORLD_BOSS_PARTY_MAX || mp.partyId === OPT_PARTY_ID}
                    onClick={() => run(() => decideJoinAction(d.id, mp.partyId, r.userId, true), undefined, { t: 'decide', userId: r.userId, accept: true })}
                    className="rounded-md bg-orange-700 px-2.5 py-1 text-[11px] font-bold text-orange-50 disabled:opacity-40"
                  >
                    수락
                  </button>
                  <button
                    type="button"
                    disabled={mp.partyId === OPT_PARTY_ID}
                    onClick={() => run(() => decideJoinAction(d.id, mp.partyId, r.userId, false), undefined, { t: 'decide', userId: r.userId, accept: false })}
                    className="rounded-md bg-stone-800 px-2.5 py-1 text-[11px] font-bold text-stone-400 disabled:opacity-40"
                  >
                    거절
                  </button>
                </div>
              ))}
            </div>
          )}

          {mp.status === 'recruiting' ? (
            mp.isLeader ? (
              // 원정대장: 출발(크게, 인원 없이, 초록 — 주황 무대와 구분되는 '결정' 색, 발광 없음) + 아래 작은 글자 버튼 해산(10-10 사용자). 출발은 확인 팝업(명단·합산 전투력).
              <div className="mt-2.5">
                <button
                  type="button"
                  disabled={pending || !active || mp.partyId === OPT_PARTY_ID}
                  onClick={() => setDepartAsk(true)}
                  className="w-full rounded-xl bg-emerald-600 py-3 text-[14px] font-extrabold text-emerald-50 disabled:opacity-40"
                >
                  출발
                </button>
                <button
                  type="button"
                  disabled={mp.partyId === OPT_PARTY_ID}
                  onClick={() => run(() => leavePartyAction(d.id, mp.partyId), { title: '원정대를 해산했어요' }, { t: 'leave' })}
                  className="mt-1 w-full py-1.5 text-[11.5px] font-bold text-stone-500 disabled:opacity-40"
                >
                  원정대 해산
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => run(() => leavePartyAction(d.id, mp.partyId), { title: '원정대에서 나왔어요' }, { t: 'leave' })}
                className="mt-2 w-full rounded-lg border border-stone-700 py-2 text-[12px] font-bold text-stone-400"
              >
                나가기
              </button>
            )
          ) : (
            myCard && (
              <>
                <div className="mt-2.5 rounded-lg bg-orange-950/40 px-2.5 py-2">
                  <DepartedSummary p={myCard} withReward />
                  {/* 내 결과(10-11 사용자): 피해 아래 개인 보상 — 공격 수·내 피해·뽑은 보상(우편과 같은 값). */}
                  {mp.myResult && (
                    <p className="mt-1 flex items-center justify-between whitespace-nowrap border-t border-orange-900/50 pt-1 text-[11px] text-stone-300">
                      <span>
                        내 공격 <b className="font-mono text-stone-100">{mp.myResult.attacks}</b>회 · 피해 <b className="font-mono text-orange-200">{formatCompactKR(mp.myResult.damage)}</b>
                      </span>
                      <b className="text-orange-300">
                        {mp.myResult.diamond > 0 || mp.myResult.boxes > 0
                          ? [mp.myResult.diamond > 0 ? `💎${mp.myResult.diamond.toLocaleString('ko-KR')}` : '', mp.myResult.boxes > 0 ? `📦${mp.myResult.boxes}` : ''].filter(Boolean).join(' ')
                          : '꽝'}
                      </b>
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => openBattle(myCard.id)}
                  className="mt-2 w-full rounded-xl bg-orange-700 py-2.5 text-[13px] font-extrabold text-orange-50 disabled:opacity-40"
                >
                  내 전투 다시 보기
                </button>
              </>
            )
          )}
        </section>
      )}

      {/* 원정대 목록 — 모집 중 / 출발 */}
      <div className="mx-3 mt-4 flex gap-1 rounded-xl bg-stone-900 p-1">
        {(
          [
            ['recruiting', `모집 중 ${recruiting.length}`],
            // '종료' — 출발과 동시에 결과가 정해지므로 '출발'은 진행 중처럼 읽혔다(10-10 사용자, '완료'보다 '종료').
            ['departed', `종료 ${departed.length}`],
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
            <Empty title={!active ? '원정이 종료돼 모집이 끝났어요' : '모집 중인 원정대가 없어요'} />
          ) : (
            recruiting.map((p) => {
              const isPending = me?.pendingPartyIds.includes(p.id) ?? false;
              const isInvited = invitedIds.has(p.id) && active && me?.state !== 'fought' && me?.state !== 'member';
              const full = p.memberCount >= WORLD_BOSS_PARTY_MAX;
              // 다른 원정대에 신청해 둔 채로도 더 신청할 수 있다(여러 곳 동시 신청).
              const canRequest = active && (me?.state === 'none' || me?.state === 'pending') && !full;
              return (
                <div
                  key={p.id}
                  className={`overflow-hidden rounded-xl border bg-stone-900 p-2.5 ${isInvited ? 'border-orange-500/70' : isPending ? 'border-orange-500/55' : 'border-stone-800'}`}
                >
                  {/* 초대받은 원정대(10-11 사용자, I2 머리띠): 맨 앞 + 카드 위를 가로지르는 주황 띠(누가 초대했는지). 본문은 다른 카드와 같다. */}
                  {isInvited && (
                    <div className="-mx-2.5 -mt-2.5 mb-2 flex items-center gap-1 whitespace-nowrap bg-orange-700 px-2.5 py-1 text-[11px] font-bold text-orange-50">
                      ✉ <b className="font-extrabold">{p.leaderNickname}</b> 원정대장이 초대했어요
                    </div>
                  )}
                  <PartyHead p={p} />
                  {p.intro && <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-stone-300">{p.intro}</p>}
                  {/* 명단 — 대장 먼저, 문양 + 이름 + 전투력(10-10 사용자: 누가 있는지·수치를 컴팩트하게). */}
                  <Roster members={p.members} value="combat" />
                  <div className="my-1.5 flex gap-[3px]">
                    {Array.from({ length: WORLD_BOSS_PARTY_MAX }, (_, i) => (
                      <i key={i} className={`h-[5px] flex-1 rounded-sm ${i < p.memberCount ? 'bg-orange-700' : 'bg-stone-800'}`} />
                    ))}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 text-[10.5px] text-stone-400">
                      합산 전투력 <b className="text-orange-300">{formatCompactKR(p.combatSum)}</b>
                    </span>
                    {/* 초대받은 원정대(10-11): 레이드처럼 '참가'로 바로 들어간다(신청·수락 없음). */}
                    {isInvited && !full ? (
                      <>
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => run(() => respondInviteAction(d.id, p.id, true), { title: '원정대에 들어갔어요' }, { t: 'respondInvite', partyId: p.id })}
                          className="rounded-lg bg-orange-600 px-3 py-1.5 text-[11.5px] font-extrabold text-orange-50 disabled:opacity-40"
                        >
                          바로 참가
                        </button>
                      </>
                    ) : isPending ? (
                      <>
                        <span className="shrink-0 text-[10.5px] font-bold text-orange-300">신청 완료</span>
                        <button
                          type="button"
                          onClick={() => run(() => cancelRequestAction(d.id, p.id), { title: '신청을 취소했어요' }, { t: 'cancel', partyId: p.id })}
                          className="rounded-lg border border-stone-700 px-3 py-1.5 text-[11.5px] font-bold text-stone-400"
                        >
                          신청 취소
                        </button>
                      </>
                    ) : full ? (
                      <span className="text-[10.5px] text-stone-500">가득 찼어요</span>
                    ) : canRequest ? (
                      <button
                        type="button"
                        onClick={() => run(() => requestJoinAction(d.id, p.id), { title: '참가를 신청했어요', detail: '원정대장이 수락하면 알려 드려요' }, { t: 'request', partyId: p.id })}
                        className="rounded-lg bg-orange-700 px-3 py-1.5 text-[11.5px] font-bold text-orange-50"
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
          <Empty title="아직 종료된 원정대가 없어요" />
        ) : (
          departed.map((p, i) => (
            // 완료 카드 — 피해 많은 순(N위) · 피해 · 원정대원(피해) · 원정대 획득. 라운드·단계·전투 보기는 두지 않는다(10-10 사용자).
            <div key={p.id} className={`rounded-xl border bg-stone-900 p-2.5 ${p.id === mp?.partyId ? 'border-orange-500/55' : 'border-stone-800'}`}>
              <PartyHead p={p} rank={i + 1} />
              <DepartedSummary p={p} />
              <Roster members={p.members} value="damage" />
              <p className="mt-1.5 text-[10.5px] text-stone-500">
                원정대 획득 💎{p.rewardDiamond.toLocaleString('ko-KR')} 📦{p.rewardBoxes.toLocaleString('ko-KR')}
              </p>
            </div>
          ))
        )}
      </div>

      {/* 출발 확인 — 명단·합산 전투력을 되읽어 준다. 버튼은 취소/출발 같은 크기(10-10 사용자). */}
      {departAsk && mp && (
        <ModalShell onClose={() => setDepartAsk(false)} onSubmit={depart} label="출발 확인">
          <ModalLayout
            title="지금 출발할까요?"
            subtitle={`${mp.members.find((m) => m.isLeader)?.nickname ?? ''} 원정대 · ${mp.members.length}명`}
            maxBodyClass="max-h-[52vh]"
            footer={
              <>
                <ModalButton onClick={() => setDepartAsk(false)}>취소</ModalButton>
                <ModalButton tone="success" onClick={depart} disabled={pending}>
                  출발
                </ModalButton>
              </>
            }
          >
            {/* 무대(시안 A, 10-10): 보스·단계·특성이 한 장에 — "어떤 보스에게 가는지". */}
            <div className="relative -mx-2 h-[96px] overflow-hidden rounded-xl bg-stone-950">
              <WorldBossBackdrop bgSrc={bgSrc} emberSrc={assetUrl(worldBossBgEmberUrl())} />
              <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(12,10,9,0.15)_0%,transparent_35%,rgba(12,10,9,0.92)_100%)]" />
              <WorldBossSprite region={d.region} alt="" className="absolute left-1/2 top-[42%] z-[1] h-[72px] w-[72px] -translate-x-1/2 -translate-y-1/2" />
              <div className="absolute bottom-2 left-2.5 z-[2] [text-shadow:0_1px_2px_#000]">
                <span className="block text-[10.5px] text-orange-200">{d.name}</span>
                <b className="block text-[13px] text-stone-100">
                  {d.stage}페이즈 · 다음 페이즈까지 {formatCompactKR(remainHp)}
                </b>
              </div>
              {d.traits.length > 0 && (
                <div className="absolute bottom-2 right-2.5 z-[2] text-right text-[10px] leading-snug text-stone-200 [text-shadow:0_1px_2px_#000]">
                  {d.traits.map((t) => (
                    <span key={t.code} className="block">
                      {t.icon} {t.name}
                    </span>
                  ))}
                </div>
              )}
            </div>
            {/* 대원 목록(P3-c, 10-11 사용자) — 대난투 순위 행처럼 얼굴을 왼쪽에 깔고 이름·원정대장 칩·길드 / 장착 3칸 + 부위 전투력 "95만 · 95만 · 95만"(보너스는 칸·글자 색으로만: 보라 아바타·주황 약점) / 오른쪽 전투력.
                10명이면 행 66px × 10이라 명단만 안쪽 스크롤(3.5행, 아래 흐림만 — 'N명 더' 글자는 두지 않는다) — 무대·합산·버튼은 그대로(T1). 글은 개행하지 않는다(10-11 사용자). */}
            <p className="-mx-2 mt-2.5 flex items-center justify-between whitespace-nowrap text-[10px] text-stone-500">
              <span className="flex items-center gap-2.5">
                <span className="flex items-center gap-1">
                  <i className="inline-block h-2.5 w-2.5 rounded-[3px] border border-violet-500 bg-violet-950/60" />아바타 +{Math.round(WORLD_BOSS_AVATAR_BONUS * 100)}%
                </span>
                <span className="flex items-center gap-1">
                  <i className="inline-block h-2.5 w-2.5 rounded-[3px] border border-orange-500 bg-orange-950/60" />약점 +{Math.round(d.weakBonus * 100)}%
                </span>
              </span>
            </p>
            <div className="relative -mx-2 mt-1">
              <ul className="max-h-[236px] overflow-y-auto overscroll-contain rounded-lg border border-stone-800 bg-stone-950">
                {mp.members.map((m) => (
                  <DepartRow key={m.userId} m={m} />
                ))}
              </ul>
              {mp.members.length > 3 && <span className="pointer-events-none absolute inset-x-0 bottom-0 h-9 rounded-b-lg bg-gradient-to-b from-transparent to-stone-900" />}
            </div>
            <p className="-mx-2 mt-2.5 flex items-center justify-between text-[12px]">
              <span className="text-stone-500">합산 전투력</span>
              <b className="font-mono tabular-nums text-orange-600 dark:text-orange-400">{formatCompactKR(mp.members.reduce((s, m) => s + m.combat, 0))}</b>
            </p>
            {/* 구성 특성이 켜져 있으면 적용 뒤 합산도(시안 ②). 무소속 배율은 대원별이라 여기선 제외. */}
            {partyMult > 1 && (
              <p className="-mx-2 mt-1 flex items-center justify-between text-[11.5px] text-stone-500">
                <span>
                  {traitStatus.filter((s) => s.active && s.code !== 'wanderer').map((s) => `${worldBossTraitDef(s.code)!.icon} ${worldBossTraitDef(s.code)!.name} ×${s.mult}`).join(' · ')}
                </span>
                <b className="font-mono tabular-nums text-emerald-600 dark:text-emerald-400">{formatCompactKR(Math.round(mp.members.reduce((s, m) => s + m.combat, 0) * partyMult))}</b>
              </p>
            )}
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
                <ModalButton tone="primary" onClick={create}>
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
              placeholder="소개글을 작성해 주세요(선택)"
              className="block w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-[16px] leading-tight text-zinc-900 outline-none placeholder:text-zinc-400 focus:border-amber-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-500"
            />
            <p className="mt-1 text-right text-[10.5px] tabular-nums text-stone-500">
              {intro.length}/{WORLD_BOSS_PARTY_INTRO_MAX}
            </p>
            {/* 미리보기(시안 A, 10-10): 다른 사람에게 보일 모집 카드를 치는 대로 보여 준다. */}
            {me?.person && (
              <div className="mt-2 rounded-xl border border-orange-500/40 bg-stone-950 px-2.5 py-2 text-left">
                <div className="flex items-center gap-1.5">
                  <b className="truncate text-[12.5px] text-stone-100">{me.person.nickname} 원정대</b>
                  {me.person.guildName && (
                    <span className="min-w-0 text-[10px] text-stone-500">
                      <Guild p={me.person} />
                    </span>
                  )}
                  <span className="ml-auto shrink-0 rounded-full bg-orange-700 px-1.5 text-[9px] font-extrabold leading-[1.6] text-orange-50">미리보기</span>
                  <span className="shrink-0 font-mono text-[11px] font-extrabold tabular-nums text-orange-300">1/{WORLD_BOSS_PARTY_MAX}</span>
                </div>
                {/* 소개글을 안 적으면 아무 줄도 두지 않는다(10-11 사용자). */}
                {intro.trim() && <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-stone-300">{intro.replace(/\s+/g, ' ').trim()}</p>}
                <Roster
                  members={[{ userId: me.person.userId, nickname: me.person.nickname, combat: me.person.combat, damage: 0, isLeader: true, guildEmblemUrl: me.person.guildEmblemUrl, guildEmblemColor: me.person.guildEmblemColor }]}
                  value="combat"
                />
              </div>
            )}
          </ModalLayout>
        </ModalShell>
      )}

      {/* 특성 설명 시트 — 효과만(팁 없음, 10-10 사용자). */}
      {inviteOpen && mp && (
        // 레이드 지목 초대와 같은 시트(10-11 사용자) — 초대는 곧 참여 허가. 초대/취소 뒤엔 액션의 재렌더가 '초대 중' 칸을 채운다.
        <InviteSheet bossId={d.id} partyId={mp.partyId} participants={mp.members.length} onClose={() => setInviteOpen(false)} />
      )}
      {traitSheet && (
        <ModalShell onClose={() => setTraitSheet(false)} label="보스 특성">
          <ModalLayout
            title="이 보스의 특성"
            footer={<ModalButton onClick={() => setTraitSheet(false)}>닫기</ModalButton>}
          >
            <ul className="space-y-2.5">
              {d.traits.map((t) => (
                <li key={t.code} className="flex items-start gap-2.5">
                  <span className="text-[22px] leading-none">{t.icon}</span>
                  <span className="min-w-0">
                    <b className="block text-[13px] text-orange-600 dark:text-orange-300">{t.name}</b>
                    <span className="block text-[12px] text-stone-600 dark:text-stone-300">{t.effect}</span>
                  </span>
                </li>
              ))}
            </ul>
          </ModalLayout>
        </ModalShell>
      )}

      {replay && <WorldBossReplay battle={replay} bossName={d.name} bossTraits={d.traits} bgSrc={bgSrc} onClose={() => setReplay(null)} />}
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

/** 길드 이름은 항상 문양과 함께(10-10 사용자). 무소속은 글자만. */
function Guild({ p, size = 10 }: { p: { guildName: string | null; guildEmblemUrl: string | null; guildEmblemColor: string | null }; size?: number }) {
  return p.guildName ? (
    <GuildBadge emblemUrl={p.guildEmblemUrl} emblemColor={p.guildEmblemColor} name={p.guildName} size={size} className="min-w-0" />
  ) : (
    <span className="truncate">무소속</span>
  );
}

function PartyHead({ p, rank }: { p: WorldBossPartyCard; rank?: number }) {
  return (
    <div className="flex items-center gap-1.5">
      {rank != null && (
        <span className={`shrink-0 rounded px-1 text-[10px] font-extrabold leading-[1.6] ${rank === 1 ? 'bg-orange-700 text-orange-50' : 'bg-stone-800 text-stone-300'}`}>{rank}위</span>
      )}
      <b className="truncate text-[12.5px] text-stone-100">{p.leaderNickname} 원정대</b>
      {p.guildName && (
        <span className="min-w-0 text-[10px] text-stone-500">
          <Guild p={p} />
        </span>
      )}
      <span className="ml-auto shrink-0 font-mono text-[11px] font-extrabold tabular-nums text-orange-300">
        {p.status === 'departed' ? `${p.memberCount}명` : `${p.memberCount}/${WORLD_BOSS_PARTY_MAX}`}
      </span>
    </div>
  );
}

/** 명단 칩 — ★대장 먼저, 길드 문양(무소속은 없음) + 이름 + 값(모집: 전투력 · 완료: 피해). */
function Roster({ members, value }: { members: WorldBossPartyCard['members']; value: 'combat' | 'damage' }) {
  if (members.length === 0) return null;
  return (
    <div className="mt-1.5 flex flex-wrap gap-1">
      {members.map((m) => (
        <span key={m.userId} className="inline-flex items-center gap-0.5 rounded-md bg-stone-800/80 px-1.5 py-0.5 text-[10px] leading-tight text-stone-300">
          {m.isLeader && <span className="text-orange-300">★</span>}
          {m.guildEmblemUrl && <GuildBadge emblemUrl={m.guildEmblemUrl} emblemColor={m.guildEmblemColor} size={10} className="shrink-0" />}
          <span>{m.nickname}</span>
          <span className="text-stone-500">{formatCompactKR(value === 'combat' ? m.combat : m.damage)}</span>
        </span>
      ))}
    </div>
  );
}

/** 출발한 원정대 요약 — 피해만(라운드·단계 변화는 두지 않는다, 10-10 사용자). 내 원정대 패널에서는 아래에 획득도 함께. */
function DepartedSummary({ p, withReward = false }: { p: WorldBossPartyCard; withReward?: boolean }) {
  return (
    <div className="mt-1">
      <p className="text-[11px] text-stone-300">
        피해 <b className="text-orange-200">{formatCompactKR(p.damage)}</b>
      </p>
      {withReward && (
        <p className="mt-0.5 text-[10.5px] text-stone-500">
          원정대 획득 💎{p.rewardDiamond.toLocaleString('ko-KR')} 📦{p.rewardBoxes.toLocaleString('ko-KR')}
        </p>
      )}
    </div>
  );
}

/** 전신 아바타(10-10 사용자: 얼굴 크롭 대신 전신) — 파견 카드와 같은 방식, south 그림을 칸 높이에 꽉 채워 바닥 정렬. */
function Body({ src, h }: { src: string | null; h: string }) {
  // 정사각 칸에 object-contain — 그림 비율을 바꾸거나 옆을 자르지 않는다(10-10 점검).
  return (
    <span className={`flex ${h} aspect-square shrink-0 items-end justify-center`}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" decoding="async" draggable={false} className="h-full w-full object-contain object-bottom" style={{ imageRendering: 'pixelated' }} />
      ) : (
        <span className="pb-1 text-base">👤</span>
      )}
    </span>
  );
}

/** 부위 전투력 짧은 표기 — 100만 이상은 소수점 없이(143만), 그 아래는 formatCompactKR(9.6만). 한 줄에 셋이 들어가야 한다. */
const shortKR = (n: number) => (n >= 1_000_000 ? `${Math.round(n / 10_000).toLocaleString('ko-KR')}만` : formatCompactKR(n));

/** 출발 팝업 대원 행(P3-c, 10-11) — 얼굴 왼쪽(대난투 크롭) · 이름/원정대장/길드 · 장착 3칸 + 부위 전투력 · 오른쪽 합. */
function DepartRow({ m }: { m: WorldBossMyParty['members'][number] }) {
  return (
    <li className="relative flex h-[66px] items-center overflow-hidden border-b border-stone-800/80 last:border-b-0">
      {m.avatarSrc && (
        <div className="pointer-events-none absolute inset-y-0 left-0 w-[80px]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={m.avatarSrc} alt="" aria-hidden decoding="async" className="absolute inset-0 h-full w-full" style={meleeFaceCropStyle(m.faceBox)} />
        </div>
      )}
      {/* 오른쪽에서 어두워지는 그라데이션 — 글자 자리 확보(대난투 행과 같은 방식, 얼굴이 왼쪽이라 방향만 반대) */}
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_left,#0c0a09_0%,#0c0a09_64%,rgba(12,10,9,0.1)_100%)]" />
      <div className="relative z-10 flex w-full items-center gap-1.5 pl-[68px] pr-2">
        <span className="min-w-0 flex-1 leading-tight">
          <span className="flex min-w-0 items-center gap-1 text-[12.5px] font-bold text-stone-50 [text-shadow:0_1px_2px_#000]">
            <span className="min-w-0 truncate">{m.nickname}</span>
            {m.isLeader && <LeaderChip />}
            <span className="min-w-0 shrink truncate text-[9.5px] font-semibold text-stone-300"><Guild p={m} size={9} /></span>
          </span>
          <span className="mt-1 flex items-center gap-1.5 whitespace-nowrap">
            <span className="flex gap-[2px]">
              {m.pieces.map((p) => (
                <span key={p.slot} className={`flex h-5 w-5 items-center justify-center rounded-[5px] border ${p.weak ? 'border-orange-500 bg-orange-950/60' : p.av ? 'border-violet-500 bg-violet-950/50' : 'border-stone-700 bg-stone-900'}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {p.src ? <img src={p.src} alt="" className="h-4 w-4 object-contain" style={{ imageRendering: 'pixelated' }} /> : null}
                </span>
              ))}
            </span>
            <span className="min-w-0 overflow-hidden whitespace-nowrap font-mono text-[9.5px] tabular-nums text-stone-300 [text-shadow:0_1px_2px_#000]">
              {m.pieces.length === 0 ? (
                <span className="text-stone-600">장착 없음</span>
              ) : (
                m.pieces.map((p, i) => (
                  <span key={p.slot}>
                    {i > 0 && <span className="mx-px text-stone-600">·</span>}
                    <span className={p.weak ? 'text-orange-300' : p.av ? 'text-violet-300' : ''}>{shortKR(p.cp)}</span>
                  </span>
                ))
              )}
            </span>
          </span>
        </span>
        <span className="shrink-0 whitespace-nowrap text-right leading-tight">
          <span className="block text-[9px] text-stone-500">전투력</span>
          <b className="block font-mono text-[13px] font-black tabular-nums text-orange-300 [text-shadow:0_1px_2px_#000]">{formatCompactKR(m.combat)}</b>
        </span>
      </div>
    </li>
  );
}

/** 내 원정대 칸(10-11 B안) — 둥근 얼굴 + 이름 + 전투력. 원정대장은 주황 테두리 + 👑, 길드 문양은 얼굴 왼쪽 아래. 누르면 프로필. */
function SlotPerson({ p, serverId, leader, inviting = false }: { p: WorldBossPerson; serverId: number; leader: boolean; inviting?: boolean }) {
  const body = (
    <>
      <span className="relative">
        <Avatar src={p.avatarSrc} box={p.faceBox} size={`h-11 w-11 rounded-full bg-stone-800 ring-2 ${leader ? 'ring-orange-500 shadow-[0_0_8px_rgba(249,115,22,0.5)]' : inviting ? 'ring-stone-500 opacity-50' : 'ring-stone-700'}`} />
        {leader && (
          <span className="absolute -right-1.5 -top-1.5 text-[12px] [text-shadow:0_1px_2px_#000]" aria-label="원정대장">
            👑
          </span>
        )}
        {p.guildEmblemUrl && (
          <span className="absolute -bottom-0.5 -left-1 rounded-full bg-stone-900 p-px">
            <GuildBadge emblemUrl={p.guildEmblemUrl} emblemColor={p.guildEmblemColor} size={11} />
          </span>
        )}
      </span>
      <span className={`block w-full truncate text-center text-[10.5px] font-bold ${inviting ? 'text-stone-400' : 'text-stone-100'}`}>{p.nickname}</span>
      <span className={`block text-[9px] tabular-nums ${inviting ? 'text-orange-300/80' : 'font-mono text-stone-400'}`}>{inviting ? '초대 중' : formatCompactKR(p.combat)}</span>
    </>
  );
  const cls = 'flex min-w-0 flex-col items-center gap-0.5 leading-tight';
  return p.code ? (
    <Link prefetch={false} href={profileHref(p.code, serverId)} className={cls}>
      {body}
    </Link>
  ) : (
    <span className={cls}>{body}</span>
  );
}

/** 빈 자리 — 점선 동그라미 '+'. 대장(모집 중)은 주황 점선이고 누르면 초대 시트(10-11 사용자: 글자는 '빈 자리'만). */
function SlotEmpty({ onClick }: { onClick?: () => void }) {
  const inner = (
    <>
      <span className={`flex h-11 w-11 items-center justify-center rounded-full border border-dashed text-[16px] ${onClick ? 'border-orange-500/60 text-orange-400' : 'border-stone-600 text-stone-600'}`}>+</span>
      <span className="text-[10px] text-stone-600">빈 자리</span>
    </>
  );
  const cls = 'flex min-w-0 flex-col items-center gap-0.5 leading-tight';
  return onClick ? (
    <button type="button" onClick={onClick} aria-label="빈 자리 — 초대" className={cls}>
      {inner}
    </button>
  ) : (
    <span className={cls}>{inner}</span>
  );
}
