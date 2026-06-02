'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
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
import { useResourceToast } from '@/components/ResourceToast';
import * as haptic from '@/lib/game/haptic';
import { sounds } from '@/lib/game/sound';

import {
  attackRaidAction,
  gemAttackRaidAction,
  claimRaidRewardAction,
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
  myAttacksUsed: number;
  myExtraAttacks: number;
  /** 정산 후에만 set. claimed=true면 수령 완료. */
  myReward: {
    diamond: number;
    boxes: Record<SupplySlot, number>;
    claimed: boolean;
  } | null;
  participants: { nickname: string; publicCode: string; totalDamage: number; isMe: boolean }[];
};

const MEDAL = ['🥇', '🥈', '🥉'];

// 공격 연출 로어 — 보스 5종별 커스텀. 매 공격 랜덤, 버튼 위 오버레이로 연속 클릭 차단.
const ATTACK_LORE: Record<RaidBoss, readonly string[]> = {
  slime_king: [
    '점액을 가르자 끈적한 비명이 터진다',
    '핵을 노린 일격이 젤리를 꿰뚫는다',
    '천 년의 점액이 출렁이며 갈라진다',
    '녹아내리는 칼끝이 군주를 찌른다',
  ],
  orc_chief: [
    '족장의 어금니가 한 번 더 부러진다',
    '포효를 가르고 도끼날이 박힌다',
    '전리품 두개골이 흩어진다',
    '거구가 휘청이며 변경의 빚을 갚는다',
  ],
  stone_golem: [
    '바위 틈으로 룬의 마력이 새어 나온다',
    '균열을 따라 일격이 파고든다',
    '다시 뭉치기 전에 한 조각을 깎는다',
    '산이 울리며 푸른 빛이 흩어진다',
  ],
  dragon_west: [
    '방패만 한 비늘 사이로 칼을 밀어넣는다',
    '잿빛 날개가 일격에 흔들린다',
    '끓는 숨결을 뚫고 급소를 노린다',
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
  '보석 {n}을 바쳐 한 번 더 검을 들겠는가?',
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

function useCountdown(expireAtIso: string): { text: string; over: boolean; urgent: boolean } {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const ms = new Date(expireAtIso).getTime() - now;
  if (ms <= 0) return { text: '정산 대기', over: true, urgent: false };
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  // 1시간 미만은 m:ss, 이상은 h:mm.
  const text = h > 0 ? `${h}:${String(m).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
  return { text, over: false, urgent: ms < 60_000 };
}

export function RaidSessionCard({ view: v }: { view: RaidView }) {
  const router = useRouter();
  const { showResource, showError } = useResourceToast();
  const { text: countdown, over, urgent } = useCountdown(v.expireAtIso);

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
  const canAttack = v.isParticipant && !settled && !over && left > 0;

  // 누적 보상(공시) — 현재까지 돌파한 페이즈의 결정론 드롭 합산.
  const drops = aggregatePhaseDrops(BigInt(v.raidId), v.phasesCleared);

  // ── 타격 FX: hit/crit. (insaeng은 미스 없음 — BALANCE §5.3.) ──
  const [fx, setFx] = useState<null | 'hit' | 'crit'>(null);
  const [floatDmg, setFloatDmg] = useState<{ id: number; val: number; crit: boolean } | null>(
    null,
  );
  const fxKey = useRef(0);
  // 보석 공격 — 1탭 시 3초 컨펌(카운트+로어), 그 안에 2탭하면 실행.
  const [gemConfirm, setGemConfirm] = useState(false);
  const [gemLeft, setGemLeft] = useState(0);
  const [gemLore, setGemLore] = useState<string | null>(null);
  // 공격 연출 — 로어 오버레이 + 쿨다운(연속 클릭 차단).
  const [attacking, setAttacking] = useState(false);
  const [attackLore, setAttackLore] = useState<string | null>(null);
  // 보상 수령 — 낙관 완료 표시(서버 확정 전 즉시 '수령 완료' UI).
  const [claimedOpt, setClaimedOpt] = useState(false);
  // 결산 보상 수령 여부 — 서버 확정 or 낙관 클릭(둘 중 하나면 완료 톤).
  const rewardClaimed = Boolean(v.myReward?.claimed) || claimedOpt;
  // 방금 클릭해 수령(서버 확정 전) — 글로우+도장 1회 연출 트리거. 새로고침 후엔 정적.
  const justClaimed = claimedOpt && !Boolean(v.myReward?.claimed);

  // 보석 컨펌 3초 카운트 + 로어 선택(강화 패턴).
  useEffect(() => {
    if (!gemConfirm) {
      setGemLeft(0);
      setGemLore(null);
      return;
    }
    const cost = raidExtraAttackCost(v.myExtraAttacks + 1);
    setGemLeft(3);
    setGemLore(pick(GEM_CONFIRM_LORE).replace('{n}', `💎${cost.toLocaleString()}`));
    const id = setInterval(() => {
      setGemLeft((s) => {
        if (s <= 1) {
          setGemConfirm(false);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gemConfirm]);

  // ── 페이즈 게이지: 이전 페이즈가 100% 다 찬 뒤 다음 컬러로 순차 진행 ──
  // 현재 진행률 계산: 누적 임계 = phase1·2·(1.5^N − 1).
  const thrFloor = v.phase1Hp * 2 * (1.5 ** v.phasesCleared - 1);
  const nextHp = raidPhaseHp(v.phase1Hp, v.phasesCleared + 1);
  const targetProg = Math.max(0, Math.min(1, (v.totalDamage - thrFloor) / nextHp));

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
      | { status: 'success'; damage: number; isCrit: boolean }
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
      const r = await action();
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
      router.refresh();
      // 쿨다운 — 오버레이 유지 동안 재공격 차단(연속 클릭 + refresh 깜빡임 방지).
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

  const handleGemAttack = () => {
    if (attacking) return;
    if (!gemConfirm) {
      haptic.tap();
      setGemConfirm(true); // useEffect가 3초 카운트 + 로어 설정
      return;
    }
    setGemConfirm(false);
    // 낙관 — 보석 공격은 추가 공격(extra+1)+공격(used+1)이라 left 변화 0. 응답 후 깜빡임 방지.
    setLocalExtra((n) => n + 1);
    setLocalUsed((n) => n + 1);
    runAttack(
      () => gemAttackRaidAction(v.raidId),
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
    // 백그라운드 확정 — 실패(이미 수령 등) 시 롤백.
    void (async () => {
      const r = await claimRaidRewardAction(v.raidId);
      if (r.status !== 'success') {
        setClaimedOpt(false);
        showError(r.message);
        return;
      }
      setTimeout(() => router.refresh(), 600);
    })();
  };

  const handleInvite = () => {
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
      const imageUrl = `${origin}/og/raid/${v.bossCode}.png?v=${v.raidId}`;
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
      showResource('🔗', '초대 링크를 복사했어요');
    }
  };

  const bossBg = getBossBg(v.bossCode);
  return (
    // 레이드 상세는 grow와 동일한 다크 톤 강제.
    <section className="min-h-full overflow-hidden bg-zinc-950 text-zinc-100">
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

        <div className="absolute left-0 right-0 top-0 z-10 flex items-start justify-between p-3">
          <div className="text-sm font-extrabold drop-shadow">
            {boss.name}
            {v.isHost ? (
              <span className="ml-1 rounded bg-amber-500 px-1 text-[9px] text-amber-950">방장</span>
            ) : null}
          </div>
          <div
            className={`rounded-full px-2.5 py-1 font-mono text-sm font-bold backdrop-blur ${
              settled
                ? 'bg-black/40 text-zinc-300'
                : urgent
                  ? 'animate-pulse-soft bg-red-500/80 text-white'
                  : 'bg-black/40 text-amber-200'
            }`}
          >
            {settled ? '종료' : `⏳ ${countdown}`}
          </div>
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
              누적 {v.totalDamage.toLocaleString()}
            </span>
          </div>
          <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-zinc-800">
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
              참여 보상이 없습니다 (공격 0회).
            </div>
          ) : (
            <div
              className={`relative overflow-hidden rounded-xl border-2 p-3 text-center transition ${
                rewardClaimed
                  ? 'border-emerald-600/50 bg-gradient-to-br from-emerald-900/40 to-green-900/25'
                  : 'border-amber-500/60 bg-gradient-to-br from-amber-900/40 to-yellow-900/30'
              } ${justClaimed ? 'animate-claim-glow' : ''}`}
            >
              <div
                className={`text-sm font-bold ${
                  rewardClaimed ? 'text-emerald-300' : 'text-amber-300'
                }`}
              >
                결산 보상
              </div>
              <div
                className={`mt-1.5 flex flex-wrap items-center justify-center gap-x-2.5 gap-y-0.5 text-[12px] text-zinc-100 ${
                  rewardClaimed ? 'opacity-70' : ''
                }`}
              >
                {v.myReward.diamond > 0 ? (
                  <span className="font-mono font-bold">
                    💎 {v.myReward.diamond.toLocaleString()}
                  </span>
                ) : null}
                {(['weapon', 'armor', 'accessory'] as SupplySlot[]).map((s) => (
                  <span key={s}>
                    {SLOT_EMOJI[s]} {SLOT_LABEL[s]}{' '}
                    <span className="font-mono font-bold">{v.myReward?.boxes[s] ?? 0}</span>
                  </span>
                ))}
              </div>
              <button
                type="button"
                disabled={rewardClaimed}
                onClick={handleClaim}
                className={`mt-2.5 w-full rounded-full px-4 py-2.5 text-sm font-extrabold transition ${
                  rewardClaimed
                    ? 'cursor-default border border-emerald-700/40 bg-emerald-950/40 text-emerald-500/60'
                    : 'bg-gradient-to-r from-amber-500 to-yellow-500 text-amber-950 shadow-lg shadow-amber-900/40 active:scale-95 hover:brightness-110'
                }`}
              >
                {rewardClaimed ? '수령 완료' : '보상 받기'}
              </button>
            </div>
          )
        ) : (
          <div className="space-y-2">
            {canAttack ? (
              <div className="relative">
                <button
                  type="button"
                  onClick={handleAttack}
                  disabled={attacking}
                  className="w-full rounded-full bg-gradient-to-r from-red-600 to-orange-500 px-4 py-3.5 text-sm font-extrabold text-white shadow-lg shadow-red-900/40 transition active:scale-95 hover:brightness-110 disabled:opacity-60"
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
                <button
                  type="button"
                  onClick={handleGemAttack}
                  disabled={attacking}
                  className={`w-full rounded-full border-2 px-4 py-3 text-xs font-bold leading-snug transition active:scale-95 disabled:opacity-60 ${
                    gemConfirm
                      ? 'animate-pulse-soft border-red-400 bg-red-500/20 text-red-100'
                      : 'border-amber-400 bg-amber-400/10 text-amber-300'
                  }`}
                >
                  {gemConfirm
                    ? `${gemLore ?? ''} (${gemLeft})`
                    : `💎 ${raidExtraAttackCost(v.myExtraAttacks + 1).toLocaleString()} 추가 공격`}
                </button>
                {attackLore ? (
                  <div className="absolute inset-0 z-20 flex items-center justify-center rounded-full bg-black/60 backdrop-blur-[2px]">
                    <span className="rounded bg-black/80 px-2 py-0.5 text-[12px] font-semibold break-keep text-amber-200">
                      {attackLore}
                    </span>
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="rounded-full bg-zinc-800 px-4 py-3 text-center text-sm text-zinc-400">
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
                  className={`relative overflow-hidden rounded-lg px-2.5 py-1.5 text-[11px] ${
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
                    <Link
                      href={`/u/${encodeURIComponent(p.publicCode)}`}
                      className="min-w-0 flex-1 truncate font-medium hover:underline"
                    >
                      {p.nickname}
                      {p.isMe ? ' (나)' : ''}
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
    </section>
  );
}
