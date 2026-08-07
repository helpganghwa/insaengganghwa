'use client';
import { profileHref } from '@/lib/game/profile/href';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';

import {
  RAID_BASE_ATTACKS,
  raidExtraAttackCost,
  raidPhaseHp,
  type SupplySlot,
} from '@/lib/game/balance';
import { aggregatePhaseDrops } from '@/lib/game/raid/drops';
import { RAID_BOSSES, pickRaidShareCopy, type RaidBoss } from '@/lib/game/raid/bosses';
import { BossSprite } from '@/components/BossSprite';
import { getBossBg, getBossBgClass } from '@/lib/game/raid/boss-sprites';
import { assetUrl } from '@/lib/asset-versions';
import { useResourceToast, type HeaderReward } from '@/components/ResourceToast';
import { RaidInviteSheet } from './RaidInviteSheet';
import { GuildBadge } from '@/components/GuildBadge';
import * as haptic from '@/lib/game/haptic';
import { sounds } from '@/lib/game/sound';
import { BackFab } from '@/components/BackNav';
import { Ticker } from '@/components/Ticker';
import { ConfirmButton } from '@/components/ui/ConfirmButton';

import {
  attackRaidAction,
  gemAttackRaidAction,
  claimRaidRewardAction,
  decideJoinRequestAction,
  joinRaidAction,
} from './actions';

export type RaidView = {
  raidId: string;
  bossCode: RaidBoss;
  status: 'active' | 'settled';
  expireAtIso: string;
  shareCode: string;
  isHost: boolean;
  phase1Hp: number;
  totalDamage: number;
  phasesCleared: number;
  isParticipant: boolean;
  /** 비참가 관전 모드(2026-07-27 문의 #30) — 참가/요청 버튼 정보. 참가자는 null. */
  /** 참가 경로 — invite(0146)는 지목 초대로 승인 없이 즉시 참여한다. */
  join: {
    scope: 'friend' | 'guild' | 'link' | 'invite';
    mode: 'free' | 'approval';
    requested: boolean;
  } | null;
  myAttacksUsed: number;
  myExtraAttacks: number;
  /** 정산 후에만 set. claimed=true면 수령 완료. */
  myReward: {
    boxes: Record<SupplySlot, number>;
    claimed: boolean;
  } | null;
  participants: {
    nickname: string;
    publicCode: string;
    totalDamage: number;
    isMe: boolean;
    guildEmblemUrl: string | null;
  }[];
  /** 개설자만 — 대기 중 참가 요청(공유링크 등). */
  pendingRequests: { userId: string; nickname: string; publicCode: string }[];
};

const MEDAL = ['🥇', '🥈', '🥉'];

// 액션 슬롯 공용 크기(2026-07-27 피드백 3) — 참가/요청/공격/보석/대기 모두 h-12 고정으로
// 상태 전환 시 레이아웃 시프트 제거. 색·타이포는 각 상태가 덧붙임.
const ACTION_SLOT = 'flex h-12 w-full items-center justify-center rounded-full px-4 transition';

// 공격 연출 로어 — 보스 5종별 커스텀. 매 공격 랜덤, 버튼 위 오버레이로 연속 클릭 차단.
const ATTACK_LORE: Record<RaidBoss, readonly string[]> = {
  slime_king: [
    '일격에 점액이 사방으로 튄다',
    '핵을 노린 일격이 깊숙이 파고든다',
    '천 년의 점액이 출렁이며 갈라진다',
    '일격이 군주의 핵을 뒤흔든다',
  ],
  orc_chief: [
    '족장의 갑주가 한 번 더 우그러진다',
    '포효를 가르고 일격이 내리꽂힌다',
    '전리품 목걸이가 끊겨 흩어진다',
    '거구가 휘청이며 변경의 빚을 갚는다',
  ],
  stone_golem: [
    '바위 틈으로 룬의 마력이 새어 나온다',
    '균열을 따라 일격이 파고든다',
    '다시 뭉치기 전에 한 조각을 깎는다',
    '산이 울리며 푸른 빛이 흩어진다',
  ],
  dragon_west: [
    '방패만 한 비늘이 한 장 떨어져 나간다',
    '잿빛 날개가 일격에 흔들린다',
    '끓는 숨결을 뚫고 품속으로 파고든다',
    '고룡의 자만에 첫 균열이 난다',
  ],
  fallen_angel: [
    '깨진 후광 아래로 검은 깃털이 진다',
    '저주받은 검과 칼날이 부딪친다',
    '타락한 신성을 한 겹 벗겨낸다',
    '추락한 날개에 일격이 스민다',
  ],
};
// 보석 공격 컨펌 로어 — {n}=보석 비용.
const GEM_CONFIRM_LORE = [
  '다이아 {n}을 바쳐 한 번 더 검을 들겠는가?',
  '{n}의 대가로 일격의 기회를 청하시겠습니까?',
  '{n}을 제물 삼아 다시 맞서시겠습니까?',
  '영혼의 {n}을 불살라 추가 공격을 감행할까?',
] as const;
const pick = <T,>(a: readonly T[]): T => a[Math.floor(Math.random() * a.length)]!;

// 페이즈마다 순환하는 게이지 컬러(돌파 후 다음 컬러로 교체).
const PHASE_PALETTE = [
  { bar: 'bg-emerald-400', text: 'text-emerald-300', glow: 'shadow-emerald-400/60' },
  { bar: 'bg-sky-400', text: 'text-sky-300', glow: 'shadow-sky-400/60' },
  { bar: 'bg-violet-400', text: 'text-violet-300', glow: 'shadow-violet-400/60' },
  { bar: 'bg-amber-400', text: 'text-amber-300', glow: 'shadow-amber-400/60' },
  { bar: 'bg-rose-400', text: 'text-rose-300', glow: 'shadow-rose-400/60' },
  { bar: 'bg-cyan-400', text: 'text-cyan-300', glow: 'shadow-cyan-400/60' },
];

const SLOT_LABEL: Record<SupplySlot, string> = {
  weapon: '무기',
  armor: '방어구',
  accessory: '장신구',
};
const SLOT_EMOJI: Record<SupplySlot, string> = {
  weapon: '⚔️',
  armor: '🛡️',
  accessory: '💍',
};

/** 만료 시각에 정확히 1회만 리렌더 — 1초 인터벌로 카드 전체를 매초 그리던 것 대체(2026-08-06). */
function useDeadline(iso: string): boolean {
  // 초기값을 즉시 계산 — false 고정이면 만료 지난 카드가 첫 프레임에 공격 가능으로 보인다
  // (종전 useCountdown도 mount 시점 즉시 판정이었음 — 동일 의미 유지).
  const [over, setOver] = useState(() => Date.now() >= new Date(iso).getTime());
  useEffect(() => {
    const ms = new Date(iso).getTime() - Date.now();
    if (ms <= 0) {
      setOver(true);
      return;
    }
    setOver(false);
    const t = setTimeout(() => setOver(true), ms + 250);
    return () => clearTimeout(t);
  }, [iso]);
  return over;
}

/** 남은 시간 배지 — 1초 클럭을 이 잎(leaf)에 격리(카드 본체는 매초 리렌더되지 않는다). */
function CountdownBadge({ expireAtIso, settled }: { expireAtIso: string; settled: boolean }) {
  return (
    <Ticker>
      {(now) => {
        const ms = new Date(expireAtIso).getTime() - now;
        const over = ms <= 0;
        const urgent = !settled && !over && ms < 60_000;
        const h = Math.floor(ms / 3_600_000);
        const m = Math.floor((ms % 3_600_000) / 60_000);
        const sec = Math.floor((ms % 60_000) / 1000);
        // 1시간 미만은 m:ss, 이상은 h:mm.
        const text = over
          ? '정산 대기'
          : h > 0
            ? `${h}:${String(m).padStart(2, '0')}`
            : `${m}:${String(sec).padStart(2, '0')}`;
        return (
          <div
            className={`rounded-full px-2.5 py-1 font-mono text-sm font-bold backdrop-blur ${
              settled
                ? 'bg-black/40 text-zinc-300'
                : urgent
                  ? 'animate-pulse-soft bg-red-500/80 text-white'
                  : 'bg-black/40 text-amber-200'
            }`}
          >
            {settled ? '종료' : `⏳ ${text}`}
          </div>
        );
      }}
    </Ticker>
  );
}

export function RaidSessionCard({ view: v, serverId }: { view: RaidView; serverId: number }) {
  const { showError, showHeaderToast } = useResourceToast();
  const over = useDeadline(v.expireAtIso); // 로직용(공격 가능 여부) — 표시는 CountdownBadge가 담당

  const boss = RAID_BOSSES[v.bossCode];
  const settled = v.status === 'settled';
  // 낙관적 공격 횟수/추가 — 즉시 반영, 서버 응답(refresh)이 max로 따라잡음.
  const [localUsed, setLocalUsed] = useState(v.myAttacksUsed);
  const [localExtra, setLocalExtra] = useState(v.myExtraAttacks);
  useEffect(() => {
    setLocalUsed((n) => Math.max(n, v.myAttacksUsed));
  }, [v.myAttacksUsed]);
  useEffect(() => {
    setLocalExtra((n) => Math.max(n, v.myExtraAttacks));
  }, [v.myExtraAttacks]);
  const allowed = RAID_BASE_ATTACKS + localExtra;
  const left = allowed - localUsed;
  // 관전 모드 참가/요청(문의 #30) — 낙관적 UI(피드백 4): 클릭 즉시 공격 버튼/수락 대기로
  // 전환하고 서버 확정은 백그라운드. 실패 시 롤백 + 에러 토스트만.
  const [optJoined, setOptJoined] = useState(false);
  const [requestedLocal, setRequestedLocal] = useState(v.join?.requested ?? false);
  const joined = v.isParticipant || optJoined;
  const canAttack = joined && !settled && !over && left > 0;

  // 누적 보상(공시) — 현재까지 돌파한 페이즈의 결정론 드롭 합산.
  const drops = aggregatePhaseDrops(BigInt(v.raidId), v.phasesCleared);

  // ── 타격 FX: hit/crit. (insaeng은 미스 없음 — BALANCE §5.3.) ──
  const [fx, setFx] = useState<null | 'hit' | 'crit'>(null);
  const [floatDmg, setFloatDmg] = useState<{ id: number; val: number; crit: boolean } | null>(
    null,
  );
  const fxKey = useRef(0);
  // 보석 공격 멱등키(0109) — 클릭 의도당 1개, 전송 실패 재시도에서만 재사용.
  const gemKeyRef = useRef<string | null>(null);
  // 개설자 참가요청 수락/거절 — 낙관적 제거(서버 확정 후 refresh).
  const [handledReqs, setHandledReqs] = useState<Set<string>>(new Set());
  const decideReq = (requesterId: string, approve: boolean) => {
    setHandledReqs((s) => new Set(s).add(requesterId));
    void (async () => {
      const r = await decideJoinRequestAction(v.raidId, requesterId, approve);
      if (r.status !== 'success') {
        setHandledReqs((s) => {
          const n = new Set(s);
          n.delete(requesterId);
          return n;
        });
        showError(r.message);
        return;
      }
      showHeaderToast({ title: approve ? '참가 수락' : '요청 거절' });
      // refresh 불필요(§11.7) — 액션 rev()의 재렌더가 응답에 실려 온다.
    })();
  };
  const visibleReqs = v.pendingRequests.filter((r) => !handledReqs.has(r.userId));
  // 참가/요청 실행 — 낙관 전환 후 서버 확정. 중복 클릭은 ref 가드(로딩 UI 없음, 피드백 4).
  const joiningRef = useRef(false);
  const handleJoin = () => {
    if (joiningRef.current || !v.join) return;
    joiningRef.current = true;
    haptic.success();
    const expectFree = v.join.mode === 'free';
    if (expectFree) setOptJoined(true);
    else setRequestedLocal(true);
    void (async () => {
      const r = await joinRaidAction(v.shareCode, v.join!.scope).catch(() => null);
      joiningRef.current = false;
      if (!r || r.status === 'error') {
        // 롤백 — 관전 상태로 복귀.
        setOptJoined(false);
        setRequestedLocal(v.join?.requested ?? false);
        showError(!r ? '연결이 불안정해요. 잠시 후 다시 시도해 주세요.' : r.message);
        return;
      }
      if (r.state === 'joined') {
        setRequestedLocal(false);
        setOptJoined(true);
        showHeaderToast({ title: '레이드 참여' });
        // refresh 불필요(§11.7) — 참가자 목록 등은 액션 rev() 재렌더가 실어 온다.
      } else {
        // 예상(free)과 달리 수락형 — 요청 대기로 정정.
        setOptJoined(false);
        setRequestedLocal(true);
        showHeaderToast({ title: '참가 요청 전송' });
      }
    })();
  };

  // 보석 공격 — 1탭 시 3초 컨펌(카운트+로어), 그 안에 2탭하면 실행.
  // 보석 컨펌 카운트는 ConfirmButton(버튼 내부 state)이 보유(2026-08-07 렌더 감사) —
  // 이전엔 3초 컨펌 동안 카드 전체(히어로 img+참여자 목록 ≈250노드)가 매초 리렌더됐다.
  // 로어는 무장 시점 1회 선택 — ref라 리렌더 없이 armed 렌더 함수가 읽는다.
  const gemLoreRef = useRef<string>('');
  // 공격 연출 — 로어 오버레이 + 쿨다운(연속 클릭 차단).
  const [attacking, setAttacking] = useState(false);
  const [attackLore, setAttackLore] = useState<string | null>(null);
  // 보스 HP 낙관 반영(2026-07-23) — 공격 응답의 누적 데미지를 즉시 HP 바에 반영해
  // router.refresh(페이지 전체 재렌더) 지연과 무관하게 HP가 바로 줄어들게 한다.
  // prop이 그 값 이상으로 갱신되면(다른 유저 공격 포함) prop을 신뢰.
  const [localTotal, setLocalTotal] = useState<number | null>(null);
  // 보상 수령 — 낙관 완료 표시(서버 확정 전 즉시 '수령 완료' UI).
  const [claimedOpt, setClaimedOpt] = useState(false);
  // 결산 보상 수령 여부 — 서버 확정 or 낙관 클릭(둘 중 하나면 완료 톤).
  const rewardClaimed = Boolean(v.myReward?.claimed) || claimedOpt;
  // 방금 클릭해 수령(서버 확정 전) — 글로우+도장 1회 연출 트리거. 새로고침 후엔 정적.
  const justClaimed = claimedOpt && !Boolean(v.myReward?.claimed);

  // ── 페이즈 게이지: 이전 페이즈가 100% 다 찬 뒤 다음 컬러로 순차 진행 ──
  // 현재 진행률 계산: 누적 임계 = phase1·2·(1.5^N − 1).
  // 유효 누적 데미지 — 낙관값과 prop 중 큰 값(prop이 앞서면 다른 유저 공격 반영분이라 신뢰).
  const effTotal = localTotal != null ? Math.max(localTotal, v.totalDamage) : v.totalDamage;
  const thrFloor = v.phase1Hp * 2 * (1.5 ** v.phasesCleared - 1);
  const nextHp = raidPhaseHp(v.phase1Hp, v.phasesCleared + 1);
  const targetProg = Math.max(0, Math.min(1, (effTotal - thrFloor) / nextHp));

  // prop이 낙관값을 따라잡으면(refresh 도착) override 해제 — 이후 서버 데이터 신뢰.
  useEffect(() => {
    if (localTotal != null && v.totalDamage >= localTotal) setLocalTotal(null);
  }, [v.totalDamage, localTotal]);

  const [gPhase, setGPhase] = useState(v.phasesCleared);
  const [gPct, setGPct] = useState(targetProg * 100);
  const [phaseUp, setPhaseUp] = useState(false);
  const animTok = useRef(0);
  const lastRef = useRef({ phase: v.phasesCleared, prog: targetProg });

  useEffect(() => {
    const last = lastRef.current;
    if (last.phase === v.phasesCleared && Math.abs(last.prog - targetProg) < 0.0001) return;
    const advanced = v.phasesCleared > last.phase;
    lastRef.current = { phase: v.phasesCleared, prog: targetProg };
    const token = ++animTok.current;
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

    (async () => {
      // 페이즈 역행(보정 등)은 즉시 반영.
      if (v.phasesCleared < gPhase) {
        setGPhase(v.phasesCleared);
        setGPct(targetProg * 100);
        return;
      }
      let ph = gPhase;
      while (ph < v.phasesCleared) {
        setGPct(100);
        await sleep(440);
        if (animTok.current !== token) return;
        ph += 1;
        setGPhase(ph);
        setGPct(0);
        await sleep(50);
        if (animTok.current !== token) return;
      }
      setGPct(targetProg * 100);
      if (advanced) {
        setPhaseUp(true);
        setTimeout(() => setPhaseUp(false), 650);
      }
    })();
    // gPhase는 의도적으로 deps 제외(시퀀스 내부에서 갱신).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v.phasesCleared, targetProg]);

  const pal = PHASE_PALETTE[gPhase % PHASE_PALETTE.length]!;
  const shake = fx === 'crit' ? 'animate-crit-shake' : fx === 'hit' ? 'animate-hit-shake' : '';

  // 공격 공통 — 로어 오버레이 + 쿨다운(연속 차단). 데미지/HP는 서버 응답 반영.
  const runAttack = (
    action: () => Promise<
      | { status: 'success'; damage: number; isCrit: boolean; totalDamage?: string }
      | { status: 'error'; message: string; code: string }
    >,
    onFail?: () => void,
  ) => {
    setAttacking(true);
    setAttackLore(pick(ATTACK_LORE[v.bossCode]));
    fxKey.current += 1;
    sounds.raidHit();
    haptic.hit();
    setFx('hit');
    setTimeout(() => setFx(null), 520);
    void (async () => {
      const r = await action().catch(() => {
        // 전송 실패(오프라인 등) — reject를 삼키지 않으면 attacking=true 고착으로
        // 공격 버튼이 영구 disabled + 로어 오버레이가 안 사라진다.
        return { status: 'error', message: '공격이 전송되지 않았어요. 연결을 확인해 주세요.', code: 'NETWORK' } as const;
      });
      if (r.status !== 'success') {
        onFail?.();
        showError(r.message);
        setAttacking(false);
        setAttackLore(null);
        return;
      }
      const id = (fxKey.current += 1);
      if (r.isCrit) {
        sounds.raidCrit();
        haptic.crit();
        setFx('crit');
        setTimeout(() => setFx(null), 520);
      }
      setFloatDmg({ id, val: r.damage, crit: r.isCrit });
      setTimeout(() => setFloatDmg(null), 850);
      // 보스 HP 즉시 반영 — 서버 액션 revalidate의 현재-페이지 재렌더(§11.7)가 응답에 실려
      // 권위 상태를 동기화하므로 별도 router.refresh는 중복(요청·loadLayoutData 2배)이라 제거(2026-07-27).
      if (r.totalDamage != null) setLocalTotal(Number(r.totalDamage));
      // 쿨다운 — 오버레이 유지 동안 재공격 차단(연속 클릭 방지).
      setTimeout(() => {
        setAttacking(false);
        setAttackLore(null);
      }, 850);
    })();
  };

  const handleAttack = () => {
    if (!canAttack || attacking) return;
    setLocalUsed((n) => n + 1); // 낙관 횟수 차감
    runAttack(
      () => attackRaidAction(v.raidId),
      () => setLocalUsed((n) => Math.max(0, n - 1)),
    );
  };

  /** 보석 공격 실행 — 무장/카운트는 ConfirmButton이 담당(2차 탭에서만 호출됨). */
  const handleGemAttack = () => {
    if (attacking) return;
    // 멱등키(0109) — 전송 실패(NETWORK) 재시도는 같은 키를 재사용해 서버가 이중 차감을
    // 막는다. 성공·비즈니스 거절(서버가 차감 안 함)은 키 폐기 → 다음 클릭은 새 키.
    gemKeyRef.current ??= crypto.randomUUID();
    const key = gemKeyRef.current;
    // 낙관 — 보석 공격은 추가 공격(extra+1)+공격(used+1)이라 left 변화 0. 응답 후 깜빡임 방지.
    setLocalExtra((n) => n + 1);
    setLocalUsed((n) => n + 1);
    runAttack(
      async () => {
        const r = await gemAttackRaidAction(v.raidId, key);
        if (r.status === 'success' || r.code !== 'NETWORK') gemKeyRef.current = null;
        return r;
      },
      () => {
        setLocalExtra((n) => Math.max(0, n - 1));
        setLocalUsed((n) => Math.max(0, n - 1));
      },
    );
  };

  const handleClaim = () => {
    if (claimedOpt || !v.myReward || v.myReward.claimed) return;
    // 낙관: 보상 값은 이미 화면에 있고 claim은 서버 멱등 → 즉시 '수령 완료'(토스트 없음).
    setClaimedOpt(true);
    sounds.rewardClaim();
    haptic.success();
    // 백그라운드 확정 — 실패(이미 수령 등)·전송 실패 시 롤백.
    void (async () => {
      const r = await claimRaidRewardAction(v.raidId).catch(
        () =>
          ({ status: 'error', message: '수령이 전송되지 않았어요. 다시 시도해 주세요.', code: 'NETWORK' }) as const,
      );
      if (r.status !== 'success') {
        setClaimedOpt(false);
        showError(r.message);
        return;
      }
      // 공용 헤더 토스트로 수령 보상(보급 상자) 노출 — 값은 이미 화면에 있는 myReward(레이드=상자 전용).
      const rw = v.myReward;
      if (rw) {
        const rewards: HeaderReward[] = [
          ...(['weapon', 'armor', 'accessory'] as SupplySlot[])
            .filter((s) => rw.boxes[s] > 0)
            .map((s) => ({ icon: SLOT_EMOJI[s], amount: rw.boxes[s] })),
        ];
        if (rewards.length > 0) showHeaderToast({ title: '레이드 보상', rewards });
      }
      // refresh 불필요(§11.7) — 액션 rev() 재렌더가 보상 수령 상태를 실어 온다.
    })();
  };

  // 지목 초대 시트(0146) — '동료 초대'는 시트를 열고, 카톡 공유는 시트 안 보조 버튼이 된다.
  const [inviteOpen, setInviteOpen] = useState(false);
  const handleInvite = () => {
    haptic.tap();
    setInviteOpen(true);
  };

  /** 카카오톡 공유(보조) — 게임 안 친구가 없는 유저의 유일한 초대 수단이라 유지한다. */
  const handleKakaoShare = () => {
    haptic.tap();
    const origin = window.location.origin;
    const url = `${origin}/s/${v.shareCode}`;
    const k = (
      window as unknown as {
        Kakao?: {
          isInitialized: () => boolean;
          Share: { sendDefault: (o: unknown) => void };
        };
      }
    ).Kakao;
    if (k && k.isInitialized()) {
      // 보스 카피 — raidId 해시로 결정론 선택(동일 레이드는 일관된 문구).
      const copy = pickRaidShareCopy(v.bossCode, Number(v.raidId));
      // 미리 합성된 정적 OG(1200×630, public/og/raid/<boss>.png) — 동적 OG route 불필요.
      // 버스터 제거(2026-08-06) — 보스별 정적 PNG라 내용이 불변. ?v=raidId는 레이드마다
      // 카톡 크롤러·CDN 캐시 키를 쪼개 같은 이미지를 반복 다운로드하게 만들 뿐이었다.
      const imageUrl = `${origin}/og/raid/${v.bossCode}.png`;
      k.Share.sendDefault({
        objectType: 'feed',
        content: {
          title: copy.title,
          description: copy.body,
          imageUrl,
          imageWidth: 1200,
          imageHeight: 630,
          link: { mobileWebUrl: url, webUrl: url },
        },
        buttons: [{ title: '레이드 참여하기', link: { mobileWebUrl: url, webUrl: url } }],
      });
      return;
    }
    // 폴백 — SDK 미로드/init 시 링크 복사.
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      void navigator.clipboard.writeText(url);
      showHeaderToast({ title: '카카오톡을 열 수 없어 링크를 복사했어요' });
    }
  };

  const bossBg = getBossBg(v.bossCode);
  return (
    // 레이드 상세는 grow와 동일한 다크 톤 강제.
    <section className="min-h-full shrink-0 overflow-hidden bg-zinc-950 text-zinc-100">
      {/* ── 히어로: 배경 + 큰 보스(풀블리드, 타격 FX 오버레이) ── */}
      <div
        className={`relative flex h-60 items-end justify-center bg-gradient-to-b ${getBossBgClass(v.bossCode)}`}
      >
        {bossBg ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={assetUrl(bossBg)}
            alt=""
            loading="eager"
            fetchPriority="high"
            className="pointer-events-none absolute inset-0 h-full w-full object-cover"
            style={{ imageRendering: 'pixelated' }}
          />
        ) : null}
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_35%,transparent,rgba(0,0,0,0.6))]" />
        {fx === 'crit' ? (
          <div className="animate-crit-flash pointer-events-none absolute inset-0 bg-amber-300 mix-blend-screen" />
        ) : fx === 'hit' ? (
          <div className="animate-hit-flash pointer-events-none absolute inset-0 bg-red-500 mix-blend-screen" />
        ) : null}

        <div className={`relative mb-2 ${shake}`}>
          <BossSprite code={v.bossCode} size={168} className="drop-shadow-2xl" eager />
          {floatDmg ? (
            <span
              key={floatDmg.id}
              className={`animate-dmg-float pointer-events-none absolute left-1/2 top-2 font-mono font-extrabold ${
                floatDmg.crit ? 'text-3xl text-amber-300' : 'text-2xl text-red-300'
              }`}
              style={{ textShadow: '0 2px 6px rgba(0,0,0,0.7)' }}
            >
              {floatDmg.val.toLocaleString()}
            </span>
          ) : null}
        </div>

        {/* 상단: 뒤로가기(좌)·타이머(우) + 보스명·방장은 절대 배치로 **화면 기준 정중앙**
            — 좌우 요소 폭이 달라도 중앙 고정(2026-07-22). */}
        <div className="absolute left-0 right-0 top-0 z-10 flex items-center justify-between p-3">
          <BackFab fallback="/raid" className="h-8 w-8" />
          <div className="pointer-events-none absolute inset-x-20 top-1/2 -translate-y-1/2 truncate text-center text-sm font-extrabold drop-shadow">
            {boss.name}
            {v.isHost ? (
              <span className="ml-1 rounded bg-amber-500 px-1 text-[9px] text-amber-950">방장</span>
            ) : null}
          </div>
          <CountdownBadge expireAtIso={v.expireAtIso} settled={settled} />
        </div>
      </div>

      <div className="space-y-3 p-3">
        {/* ── 페이즈 게이지(돌파마다 컬러 순환·100% 채우고 다음으로) ── */}
        <div className={phaseUp ? 'animate-phase-up' : ''}>
          <div className="flex items-baseline justify-between text-[11px]">
            <span className="font-bold">
              <span className={`font-mono text-lg ${pal.text}`}>PHASE {gPhase}</span>
              <span className="ml-1 text-zinc-500">돌파</span>
            </span>
            <span className="font-mono text-[10px] text-zinc-500">
              누적 {effTotal.toLocaleString()}
            </span>
          </div>
          <div className="mt-1 h-2.5 isolate overflow-hidden rounded-full bg-zinc-800">
            <div
              key={gPhase}
              className={`h-full ${pal.bar} shadow-[0_0_10px] ${pal.glow}`}
              style={{ width: `${Math.max(2, gPct)}%`, transition: 'width 380ms ease-out' }}
            />
          </div>
        </div>

        {/* ── 액션: 진행 중 → 공격/추가/초대, 정산됨 → 보상 카드 ── */}
        {settled ? (
          v.myReward == null ? (
            <div className="rounded-xl border border-zinc-700 p-3 text-center text-xs text-zinc-400">
              참여 보상이 없어요 (공격 0회).
            </div>
          ) : (
            <div
              className={`relative isolate overflow-hidden rounded-xl border-2 p-3 text-center transition ${
                rewardClaimed
                  ? 'border-zinc-700 bg-zinc-800/40'
                  : 'border-amber-500/60 bg-gradient-to-br from-amber-900/40 to-yellow-900/30'
              } ${justClaimed ? 'animate-claim-glow' : ''}`}
            >
              <div
                className={`text-sm font-bold ${
                  rewardClaimed ? 'text-zinc-400' : 'text-amber-300'
                }`}
              >
                결산 보상
              </div>
              <div
                className={`mt-1.5 flex flex-wrap items-center justify-center gap-x-2.5 gap-y-0.5 text-[12px] ${
                  rewardClaimed ? 'text-zinc-400 opacity-70' : 'text-zinc-100'
                }`}
              >
                {(['weapon', 'armor', 'accessory'] as SupplySlot[]).map((s) => (
                  <span key={s}>
                    {SLOT_EMOJI[s]} {SLOT_LABEL[s]}{' '}
                    <span className="font-mono font-bold">{v.myReward?.boxes[s] ?? 0}</span>
                  </span>
                ))}
              </div>
              {/* 박스모델을 두 상태 동일하게 — 양쪽 다 border 1px(box-border)로 레이아웃 시프트 차단. */}
              <button
                type="button"
                disabled={rewardClaimed}
                onClick={handleClaim}
                className={`mt-2.5 w-full rounded-full border px-4 py-2.5 text-sm font-extrabold transition ${
                  rewardClaimed
                    ? 'cursor-default border-zinc-700 bg-zinc-800/60 text-zinc-500'
                    : 'border-amber-400 bg-gradient-to-r from-amber-500 to-yellow-500 text-amber-950 shadow-lg shadow-amber-900/40 active:scale-95 hover:brightness-110'
                }`}
              >
                {rewardClaimed ? '수령 완료' : '보상 받기'}
              </button>
            </div>
          )
        ) : (
          <div className="space-y-2">
            {!joined ? (
              // ── 관전 모드 — 공격 버튼 자리에 참가/요청(동일 h-12, 시프트 없음) ──
              requestedLocal ? (
                <div className={`${ACTION_SLOT} bg-zinc-800 text-sm font-bold text-zinc-300`}>
                  참가 요청됨 · 개설자 수락 대기
                </div>
              ) : over ? (
                <div className={`${ACTION_SLOT} bg-zinc-800 text-sm text-zinc-400`}>⏳ 정산 대기</div>
              ) : (
                <button
                  type="button"
                  onClick={handleJoin}
                  className={`${ACTION_SLOT} bg-gradient-to-r from-emerald-600 to-teal-500 text-sm font-extrabold text-white shadow-lg shadow-emerald-900/40 active:scale-95 hover:brightness-110`}
                >
                  {v.join?.mode === 'free' ? '⚔️ 레이드 참가하기' : '참가 요청 보내기'}
                </button>
              )
            ) : canAttack ? (
              <div className="relative">
                <button
                  type="button"
                  onClick={handleAttack}
                  disabled={attacking}
                  className={`${ACTION_SLOT} bg-gradient-to-r from-red-600 to-orange-500 text-sm font-extrabold text-white shadow-lg shadow-red-900/40 active:scale-95 hover:brightness-110 disabled:opacity-60`}
                >
                  ⚔️ {boss.name} 공격!  {left}/{allowed}
                </button>
                {/* 공격 로어 — 강화처럼 버튼에 정확히 맞춘 dim + 정적 텍스트(bg). */}
                {attackLore ? (
                  <div className="absolute inset-0 z-20 flex items-center justify-center rounded-full bg-black/60 backdrop-blur-[2px]">
                    <span className="rounded bg-black/80 px-2 py-0.5 text-[12px] font-semibold break-keep text-amber-200">
                      {attackLore}
                    </span>
                  </div>
                ) : null}
              </div>
            ) : !over && left <= 0 ? (
              <div className="relative">
                <ConfirmButton
                  onArm={() => {
                    haptic.tap();
                    const cost = raidExtraAttackCost(v.myExtraAttacks + 1);
                    gemLoreRef.current = pick(GEM_CONFIRM_LORE).replace('{n}', `💎${cost.toLocaleString()}`);
                  }}
                  onConfirm={handleGemAttack}
                  disabled={attacking}
                  className={`${ACTION_SLOT} border-2 text-xs font-bold leading-snug active:scale-95 disabled:opacity-60 border-amber-400 bg-amber-400/10 text-amber-300`}
                  armedClassName={`${ACTION_SLOT} animate-pulse-soft border-2 text-xs font-bold leading-snug active:scale-95 disabled:opacity-60 border-red-400 bg-red-500/20 text-red-100`}
                >
                  {(armed, left) =>
                    armed
                      ? `${gemLoreRef.current} (${left})`
                      : `💎 ${raidExtraAttackCost(v.myExtraAttacks + 1).toLocaleString()} 추가 공격`
                  }
                </ConfirmButton>
                {attackLore ? (
                  <div className="absolute inset-0 z-20 flex items-center justify-center rounded-full bg-black/60 backdrop-blur-[2px]">
                    <span className="rounded bg-black/80 px-2 py-0.5 text-[12px] font-semibold break-keep text-amber-200">
                      {attackLore}
                    </span>
                  </div>
                ) : null}
              </div>
            ) : (
              <div className={`${ACTION_SLOT} bg-zinc-800 text-sm text-zinc-400`}>
                {over ? '⏳ 정산 대기' : '공격 불가'}
              </div>
            )}
          </div>
        )}

        {/* 누적 보상 섹션 — 정산 완료(settled) 상태에서는 결산 보상 섹션과 중복이라 숨김. */}
        {!settled ? (
          <div className="rounded-lg border border-amber-700/50 bg-amber-950/30 px-3 py-2 text-center text-[11px]">
            <span className="font-semibold text-amber-300">누적 보상</span>{' '}
            {v.phasesCleared > 0 ? (
              <span className="text-zinc-200">
                {Object.entries(drops.boxes)
                  .filter(([, n]) => n > 0)
                  .map(([s, n], i) => `${i > 0 ? ' · ' : ''}${SLOT_EMOJI[s as SupplySlot]}${n}`)
                  .join('')}
              </span>
            ) : (
              <span className="text-zinc-500">아직 없음</span>
            )}
          </div>
        ) : null}

        {/* ── 참가 요청(개설자만) — 공유링크 등 요청 수락/거절 ── */}
        {v.isHost && visibleReqs.length > 0 ? (
          <div className="rounded-xl border border-amber-500/40 bg-amber-950/20 p-2.5">
            <div className="mb-1.5 text-[10px] font-semibold tracking-widest text-amber-300">
              참가 요청 {visibleReqs.length}건
            </div>
            <ul className="space-y-1">
              {visibleReqs.map((req) => (
                <li key={req.userId} className="flex items-center gap-2 text-[12px]">
                  <Link prefetch={false}
                    href={profileHref(req.publicCode, serverId)}
                    className="min-w-0 flex-1 truncate font-medium hover:underline"
                  >
                    {req.nickname}
                  </Link>
                  <button
                    type="button"
                    onClick={() => decideReq(req.userId, true)}
                    className="shrink-0 rounded-md bg-emerald-500 px-2.5 py-1 text-[11px] font-bold text-white active:scale-95"
                  >
                    수락
                  </button>
                  <button
                    type="button"
                    onClick={() => decideReq(req.userId, false)}
                    className="shrink-0 rounded-md bg-zinc-700 px-2.5 py-1 text-[11px] font-bold text-zinc-200 active:scale-95"
                  >
                    거절
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {/* ── 참여자: 기여도 순위 + 비율 바 ── */}
        <div>
          <div className="mb-1 text-[10px] font-semibold tracking-widest text-zinc-500">
            참여자 {v.participants.length}명 · 기여도 순위
          </div>
          <ul className="space-y-1">
            {v.participants.map((p, i) => {
              const pct =
                v.totalDamage > 0 ? Math.round((p.totalDamage / v.totalDamage) * 100) : 0;
              return (
                <li
                  key={i}
                  className={`relative isolate overflow-hidden rounded-lg px-2.5 py-1.5 text-[11px] ${
                    p.isMe ? 'bg-amber-900/40 ring-1 ring-amber-500/50' : 'bg-zinc-900'
                  }`}
                >
                  <div
                    className="absolute inset-y-0 left-0 bg-amber-500/10"
                    style={{ width: `${pct}%` }}
                  />
                  <div className="relative flex items-center gap-2">
                    <span className="w-5 shrink-0 text-center">
                      {MEDAL[i] ?? <span className="text-zinc-500">{i + 1}</span>}
                    </span>
                    {/* 닉네임 클릭 → 본인 포함 모두 /u/<code> 공개 프로필(불변 코드). */}
                    <Link prefetch={false}
                      href={profileHref(p.publicCode, serverId)}
                      className="flex min-w-0 flex-1 items-center gap-1 font-medium hover:underline"
                    >
                      <span className="truncate">
                        {p.nickname}
                        {p.isMe ? ' (나)' : ''}
                      </span>
                      <GuildBadge emblemUrl={p.guildEmblemUrl ?? null} size={13} className="shrink-0" />
                    </Link>
                    <span className="shrink-0 font-mono tabular-nums text-zinc-300">
                      {p.totalDamage.toLocaleString()}
                      <span className="ml-1 text-[9px] text-zinc-500">{pct}%</span>
                    </span>
                  </div>
                </li>
              );
            })}
            {/* 동료 초대 — 순위 카드와 동일 영역, 리스트 맨 아래. 10명 다 차면 미노출. */}
            {v.isHost && !over && v.participants.length < 10 ? (
              <li>
                <button
                  type="button"
                  onClick={handleInvite}
                  className="flex w-full items-center justify-center rounded-lg bg-amber-400/20 px-2.5 py-1.5 text-[11px] font-extrabold text-amber-100 ring-1 ring-inset ring-amber-400/70 transition active:scale-[0.99] hover:bg-amber-400/30"
                >
                  동료 초대
                </button>
              </li>
            ) : null}
          </ul>
        </div>
      </div>

      {inviteOpen ? (
        <RaidInviteSheet
          raidId={v.raidId.toString()}
          participants={v.participants.length}
          onClose={() => setInviteOpen(false)}
          onKakaoShare={handleKakaoShare}
        />
      ) : null}
    </section>
  );
}
