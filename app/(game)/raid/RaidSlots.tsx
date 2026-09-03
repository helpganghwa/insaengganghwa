'use client';

import Link from 'next/link';
import { useEffect, useState, useTransition } from 'react';
import { ModalShell } from '@/components/ModalShell';
import { ModalLayout, ModalButton } from '@/components/ModalLayout';
import { useRouter } from 'next/navigation';

import {
  RAID_TIERS,
  RAID_TIER_CODES,
  RAID_WINDOW_MS,
  RAID_DURATION_OPTIONS_MS,
  raidMilestoneList,
  type RaidTier,
} from '@/lib/game/balance';
import { TierChip } from './TierChip';
import { RAID_BOSSES, RAID_BOSS_CODES, type RaidBoss } from '@/lib/game/raid/bosses';
import { BossSprite } from '@/components/BossSprite';
import { useResourceToast } from '@/components/ResourceToast';
import { useDiamondGate } from '@/components/DiamondGate';
import { PageHeader } from '@/components/ui/PageHeader';
import { getBossBg, getBossBgClass, getBossShadow } from '@/lib/game/raid/boss-sprites';
import { assetUrl } from '@/lib/asset-versions';

import { openRaidAction } from './actions';

/**
 * 슬롯 셀 — 활성 레이드와 정산 대기(미수령 보상)를 한 목록에서 표현(grow 패턴).
 * status가 'active'면 진행 상태 + 카운트다운, 'pending_claim'이면 보상 미리보기 +
 * '수령 →' 라벨. 클릭하면 둘 다 /raid/[raidId] 상세로 이동(상세에서 수령 트리거).
 */
export type RaidSlotCell =
  | {
      kind: 'active';
      raidId: string;
      bossCode: RaidBoss;
      tier: RaidTier;
      expireAtIso: string;
      phasesCleared: number;
      isHost: boolean;
      attacksLeft: number;
      myRank: number;
      participantCount: number;
    }
  | {
      kind: 'pending_claim';
      raidId: string;
      bossCode: RaidBoss;
      tier: RaidTier;
      boxes: { weapon: number; armor: number; accessory: number };
      phasesCleared: number;
      myRank: number;
      participantCount: number;
    };

/** 친구/길드가 소환한 활성 레이드 — /raid 하단 목록. */
export type FriendRaid = {
  raidId: string;
  bossCode: RaidBoss;
  tier: RaidTier;
  shareCode: string;
  expireAtIso: string;
  phasesCleared: number;
  hostNickname: string;
  participantCount: number;
  /** 내가 보낸 참가 요청이 수락 대기 중 — 목록 '요청중' 배지(2026-07-27 피드백 5). */
  requested: boolean;
  /** 참여 경로 — 통합 목록의 관계 배지 + 링크 scope(0146). */
  via: 'invite' | 'friend' | 'guild';
  /** 승인 없이 즉시 참여 가능한가(초대는 항상 true) — 배지·정렬 근거. */
  free: boolean;
};

type ShareMode = 'off' | 'free' | 'approval';
const SHARE_OPTS: { v: ShareMode; label: string }[] = [
  { v: 'off', label: '비공개' },
  { v: 'free', label: '자유' },
  { v: 'approval', label: '수락' },
];
// 상태별 활성 배경: 비공개=회색 · 자유=초록 · 수락=앰버.
const SHARE_ACTIVE: Record<ShareMode, string> = {
  off: 'bg-zinc-500 text-white',
  free: 'bg-emerald-500 text-white',
  approval: 'bg-amber-500 text-white',
};

// 공격창 길이 선택(1/3/6시간) — 공개 범위와 동일한 세그먼트 UI. 활성=amber 단색.
const HOUR_MS = 3_600_000;
const DURATION_OPTS = RAID_DURATION_OPTIONS_MS.map((ms) => ({ v: ms, label: `${ms / HOUR_MS}시간` }));

/** 진행 시간 행 — 공개 범위 행과 동일 레이아웃·버튼 크기의 세그먼트. */
function DurationRow({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-xl border border-zinc-200 px-3 py-2 dark:border-zinc-700">
      <span className="text-[12px] font-medium">진행 시간</span>
      <div className="flex shrink-0 gap-0.5 rounded-lg bg-zinc-100 p-0.5 dark:bg-zinc-800">
        {DURATION_OPTS.map((o) => (
          <button
            key={o.v}
            type="button"
            onClick={() => onChange(o.v)}
            className={`min-w-[3.25rem] rounded-md px-2 py-0.5 text-center text-[11px] font-bold transition ${
              value === o.v ? 'bg-amber-500 text-white' : 'text-zinc-500'
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

const TIER_DOT: Record<RaidTier, string> = {
  easy: 'bg-emerald-500',
  normal: 'bg-sky-500',
  hard: 'bg-rose-500',
};
function fmtMan(n: number): string {
  return n >= 10_000 ? `${(n / 10_000).toLocaleString()}만` : n.toLocaleString();
}

/**
 * 난이도 행(BALANCE §5.4) — 가로 행 3줄, 고른 행만 달성 보상을 펼친다(2026-09-03 시안 4 채택).
 * 추천 로직 없이 사실만: 체력 계수 · 페이즈 보상 · 권장 총합(참가자 전원 전투력 합), 펼침 줄에
 * 달성 보상. 소환 비용은 전 난이도 동일이라 행에 두지 않고 시트 부제·버튼에만 보인다.
 * 실기기 피드백(09-03): 시트가 스크롤 없이 들어가도록 안내 문장 삭제·행 여백 축소.
 * 유저 용어: 페이즈 보상 / 달성 보상(코드의 milestone).
 */
function TierRows({ value, onChange }: { value: RaidTier; onChange: (v: RaidTier) => void }) {
  return (
    <div className="rounded-xl border border-zinc-200 px-3 py-2 dark:border-zinc-700">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[12px] font-medium">난이도</span>
        <span className="text-[9.5px] text-zinc-500">보상 전원 동일 · 권장 총합은 파티 전원 전투력 합</span>
      </div>
      <div className="mt-1.5 space-y-1">
        {RAID_TIER_CODES.map((t) => {
          const r = RAID_TIERS[t];
          const on = t === value;
          return (
            <button
              key={t}
              type="button"
              aria-pressed={on}
              onClick={() => onChange(t)}
              className={`w-full rounded-lg border px-2.5 py-1 text-left transition ${
                on
                  ? 'border-amber-500 bg-amber-500/10'
                  : 'border-zinc-200 dark:border-zinc-700'
              }`}
            >
              {/* 390px에서 한 줄 보장(실기기 피드백 09-03) — 각 조각 nowrap, 문구 축약(HP ×8 · 📦2/페이즈). */}
              <span className="flex items-center gap-2 whitespace-nowrap">
                <span className="flex min-w-[46px] items-center gap-1 text-[12px] font-extrabold">
                  <span aria-hidden className={`inline-block h-2 w-2 rounded-full ${TIER_DOT[t]}`} />
                  {r.label}
                </span>
                <span className="min-w-0 flex-1 truncate text-[10.5px] text-zinc-500 dark:text-zinc-400">
                  HP{' '}
                  <span className="font-mono font-bold text-zinc-800 dark:text-zinc-200">
                    ×{r.hpMult}
                  </span>{' '}
                  · 📦
                  <span className="font-mono font-bold text-zinc-800 dark:text-zinc-200">
                    {r.boxesPerPhase}
                  </span>
                  /페이즈
                </span>
                <span
                  className={`text-[10px] font-semibold ${
                    r.recommendedTotalCp > 0 ? 'text-amber-600 dark:text-amber-300' : 'text-zinc-400'
                  }`}
                >
                  {r.recommendedTotalCp > 0 ? `총합 ${fmtMan(r.recommendedTotalCp)}+` : '제한 없음'}
                </span>
              </span>
              {on ? (
                // 달성 보상 — 고정 열 그리드라 폭이 좁아도 줄바꿈 없이 한 줄(칩은 truncate).
                <span
                  className="mt-1 grid items-center gap-1 border-t border-dashed border-zinc-300 pt-1 text-[10px] text-zinc-500 dark:border-zinc-600 dark:text-zinc-400"
                  style={{
                    gridTemplateColumns: `auto repeat(${raidMilestoneList(t).length}, minmax(0, 1fr))`,
                  }}
                >
                  <span className="mr-1 whitespace-nowrap">달성 보상</span>
                  {raidMilestoneList(t).map(([p, b]) => (
                    <span
                      key={p}
                      className="truncate rounded bg-zinc-100 px-1 py-px text-center font-mono text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
                    >
                      {p}{' '}
                      <span className="font-sans font-bold text-amber-600 dark:text-amber-300">📦{b}</span>
                    </span>
                  ))}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** 공개 범위 행 — 비공개/자유(즉시)/수락(요청) 세그먼트(상태별 색상 구분). */
function ShareModeRow({
  title,
  value,
  onChange,
}: {
  title: string;
  value: ShareMode;
  onChange: (v: ShareMode) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-xl border border-zinc-200 px-3 py-2 dark:border-zinc-700">
      <span className="text-[12px] font-medium">{title}</span>
      <div className="flex shrink-0 gap-0.5 rounded-lg bg-zinc-100 p-0.5 dark:bg-zinc-800">
        {SHARE_OPTS.map((o) => (
          <button
            key={o.v}
            type="button"
            onClick={() => onChange(o.v)}
            className={`min-w-[3.25rem] rounded-md px-2 py-0.5 text-center text-[11px] font-bold transition ${
              value === o.v ? SHARE_ACTIVE[o.v] : 'text-zinc-500'
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** 친구/길드 소환 레이드 목록 섹션 — 비면 미노출. 행 클릭 = 상세 관전 진입(참가는 상세에서 —
 * 2026-07-27 문의 #30: 목록의 즉시 참가 버튼 제거, 구경 후 참가 결정).
 *
 * 통합 목록(2026-07-31) — 초대·친구·길드를 한 섹션에 모으고 관계는 배지로 구분한다.
 * 섹션을 나누면 친구이자 길드원인 개설자의 레이드가 중복 노출되고, 우선순위를 고정하면
 * 더 유리한 참가 경로(자유 참여)를 버리게 된다. 경로 선택은 page가 이미 끝냈다. */
function RaidListSection({ title, raids }: { title: string; raids: FriendRaid[] }) {
  if (raids.length === 0) return null;
  return (
    <section className="mt-5">
      <h2 className="mb-2 text-[12px] font-bold text-zinc-500">{title}</h2>
      <div className="space-y-2">
        {raids.map((f) => (
          <Link prefetch={false}
            key={f.raidId}
            href={`/raid/${f.raidId}?c=${f.shareCode}&s=${f.via}`}
            style={{ boxShadow: getBossShadow(f.bossCode) }}
            className={`relative flex w-full items-center gap-3 isolate overflow-hidden rounded-xl border-2 bg-gradient-to-r p-3 text-left text-zinc-100 transition active:scale-[0.99] ${
              f.via === 'invite' ? 'border-amber-500/70' : 'border-emerald-700/50'
            } ${getBossBgClass(f.bossCode)}`}
          >
            {getBossBg(f.bossCode) ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={assetUrl(getBossBg(f.bossCode)!)}
                alt=""
                aria-hidden
                className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-30"
                style={{ imageRendering: 'pixelated' }}
              />
            ) : null}
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-black/75 via-black/45 to-black/70" />
            <div className="relative shrink-0">
              <BossSprite code={f.bossCode} size={48} />
            </div>
            <span className="relative min-w-0 flex-1">
              <span className="block truncate text-sm font-bold drop-shadow">
                {RAID_BOSSES[f.bossCode].name}
                <TierChip tier={f.tier} className="ml-1" />
                <span
                  className={`ml-1 text-[11px] font-medium ${
                    f.via === 'invite' ? 'text-amber-300' : 'text-emerald-300'
                  }`}
                >
                  {f.hostNickname}
                </span>
                {/* 관계 배지 — 통합 목록에서 누가 왜 보이는지(초대/친구/길드)를 대신 말한다. */}
                <span
                  className={`ml-1.5 rounded px-1 py-px align-middle text-[9px] font-extrabold ${
                    f.via === 'invite'
                      ? 'bg-amber-500/25 text-amber-200'
                      : f.via === 'friend'
                        ? 'bg-emerald-500/20 text-emerald-200'
                        : 'bg-sky-500/20 text-sky-200'
                  }`}
                >
                  {f.via === 'invite' ? '초대' : f.via === 'friend' ? '친구' : '길드'}
                </span>
              </span>
              <span className="mt-0.5 flex flex-wrap gap-x-2 text-[10px] text-zinc-300">
                <Countdown iso={f.expireAtIso} />
                <span>
                  페이즈 <span className="font-mono font-bold">{f.phasesCleared}</span>
                </span>
                <span>
                  인원 <span className="font-mono font-bold">{f.participantCount}/10</span>
                </span>
              </span>
            </span>
            {f.requested ? (
              <span className="relative shrink-0 rounded-full border border-amber-500/60 bg-amber-950/50 px-2 py-0.5 text-[10px] font-bold text-amber-300">
                요청중
              </span>
            ) : (
              <span className="relative shrink-0 text-lg text-zinc-400">›</span>
            )}
          </Link>
        ))}
      </div>
    </section>
  );
}

function Countdown({ iso }: { iso: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const ms = new Date(iso).getTime() - now;
  if (ms <= 0) return <span className="text-zinc-400">정산 대기</span>;
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return (
    <span className={`tabular-nums ${ms < 600000 ? 'font-bold text-red-500' : ''}`}>
      ⏳ {h}:{String(m).padStart(2, '0')}
    </span>
  );
}

export function RaidSlots({
  cells: cellsIn,
  slots,
  dailyUsed,
  dailyCap,
  openRaids = [],
}: {
  cells: RaidSlotCell[];
  slots: number;
  dailyUsed: number;
  dailyCap: number;
  /** 참여 가능한 레이드 통합 목록(초대·친구·길드) — page가 중복 제거·경로 선택을 마친 결과. */
  openRaids?: FriendRaid[];
}) {
  const router = useRouter();
  const { showError } = useResourceToast();
  const [pending, startTransition] = useTransition();
  const [picking, setPicking] = useState(false);
  const [picked, setPicked] = useState<RaidBoss | null>(null);
  const [friendShare, setFriendShare] = useState<ShareMode>('off');
  const [guildShare, setGuildShare] = useState<ShareMode>('off');
  const [durationMs, setDurationMs] = useState<number>(RAID_WINDOW_MS); // 기본 6시간
  const [tier, setTier] = useState<RaidTier>('easy'); // 기본 쉬움(가장 싸고 손해 없는 선택)
  const openCost = RAID_TIERS[tier].openCost;
  const [confirm, setConfirm] = useState(false); // 소환(유료) 3초 인-버튼 컨펌
  const [confirmLeft, setConfirmLeft] = useState(0);
  const exhausted = dailyUsed >= dailyCap;

  // 소환 컨펌 3초 카운트다운(만료 자동 해제). 초기값은 arm 시 핸들러에서 set(effect 내 직접 setState 회피).
  useEffect(() => {
    if (!confirm) return;
    const id = setInterval(() => {
      setConfirmLeft((s) => {
        if (s <= 1) {
          setConfirm(false);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [confirm]);

  const cells = Array.from({ length: slots }, (_, i) => cellsIn[i] ?? null);
  const gate = useDiamondGate(); // 다이아 부족 → 충전 유도 팝업(2026-08-22)

  const open = (code: RaidBoss) =>
    startTransition(async () => {
      const r = await openRaidAction(code, friendShare, guildShare, durationMs, tier);
      if (r.status === 'error') {
        // 부족(레이스)은 충전 유도 팝업, 그 외는 기존 토스트(2026-08-22).
        if (r.code === 'INSUFFICIENT_DIAMOND') gate.open(openCost);
        else showError(r.message);
        return;
      }
      // 팝업은 닫지 않고 상세로 이동 — 페이지 전환 시 자연 unmount(전환 중 깜빡임 방지).
      router.push(`/raid/${r.raidId}`);
    });

  return (
    <>
      <PageHeader title="레이드" fallback="/" />
      <div className="h-3" aria-hidden />
      <p className="mb-2 text-center text-[11px] text-zinc-500">
        오늘 레이드{' '}
        <span className={`font-mono font-semibold ${exhausted ? 'text-red-500' : ''}`}>
          {dailyUsed}/{dailyCap}
        </span>
      </p>
      <div className="space-y-2">
        {cells.map((s, i) =>
          s ? (
            s.kind === 'pending_claim' ? (
              <Link prefetch={false}
                key={s.raidId}
                href={`/raid/${s.raidId}`}
                style={{ boxShadow: getBossShadow(s.bossCode) }}
                className={`relative flex items-center gap-3 isolate overflow-hidden rounded-xl border-2 border-amber-700/60 bg-gradient-to-r p-3 text-zinc-100 transition active:scale-[0.99] ${getBossBgClass(s.bossCode)}`}
              >
                {getBossBg(s.bossCode) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={assetUrl(getBossBg(s.bossCode)!)}
                    alt=""
                    aria-hidden
                    loading="eager"
                    fetchPriority="high"
                    className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-30"
                    style={{ imageRendering: 'pixelated' }}
                  />
                ) : null}
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-black/75 via-black/45 to-black/75" />
                <div className="relative shrink-0">
                  <BossSprite code={s.bossCode} size={56} />
                </div>
                <span className="relative min-w-0 flex-1">
                  <span className="block text-sm font-bold drop-shadow">
                    {RAID_BOSSES[s.bossCode].name}
                    <TierChip tier={s.tier} className="ml-1" />
                    <span className="ml-1 rounded bg-amber-400 px-1 text-[9px] text-amber-950">
                      정산 대기
                    </span>
                  </span>
                  <span className="mt-0.5 flex flex-wrap gap-x-2 gap-y-0.5 text-[10px] text-amber-200">
                    <span>
                      페이즈 <span className="font-mono font-bold">{s.phasesCleared}</span>
                    </span>
                    <span>
                      내 순위{' '}
                      <span className="font-mono font-bold">
                        {s.myRank}/{s.participantCount}
                      </span>
                    </span>
                    <span>
                      ⚔️{s.boxes.weapon} 🛡️{s.boxes.armor} 💍{s.boxes.accessory}
                    </span>
                  </span>
                </span>
              </Link>
            ) : (
            <Link prefetch={false}
              key={s.raidId}
              href={`/raid/${s.raidId}`}
              style={{ boxShadow: getBossShadow(s.bossCode) }}
              className={`relative flex items-center gap-3 isolate overflow-hidden rounded-xl border-2 border-amber-700/60 bg-gradient-to-r p-3 text-zinc-100 transition active:scale-[0.99] ${getBossBgClass(s.bossCode)}`}
            >
              {/* 보스 배경 이미지(있으면) — opacity 35로 부드럽게 깔고 어둠 overlay로 가독성 확보 (grow 패턴). */}
              {getBossBg(s.bossCode) ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={assetUrl(getBossBg(s.bossCode)!)}
                  alt=""
                  aria-hidden
                  loading="eager"
                  fetchPriority="high"
                  className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-35"
                  style={{ imageRendering: 'pixelated' }}
                />
              ) : null}
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-black/70 via-black/40 to-black/70" />
              <div className="relative shrink-0">
                <BossSprite code={s.bossCode} size={56} />
              </div>
              <span className="relative min-w-0 flex-1">
                <span className="block text-sm font-bold drop-shadow">
                  {RAID_BOSSES[s.bossCode].name}
                  <TierChip tier={s.tier} className="ml-1" />
                  {s.isHost ? (
                    <span className="ml-1 rounded bg-amber-500 px-1 text-[9px] text-amber-950">
                      방장
                    </span>
                  ) : null}
                </span>
                <span className="mt-0.5 flex flex-wrap gap-x-2 gap-y-0.5 text-[10px] text-zinc-300">
                  <Countdown iso={s.expireAtIso} />
                  <span>
                    페이즈 <span className="font-mono font-bold">{s.phasesCleared}</span>
                  </span>
                  <span className={s.attacksLeft <= 0 ? 'text-zinc-500' : ''}>
                    잔여 <span className="font-mono font-bold">{s.attacksLeft}</span>
                  </span>
                  <span>
                    내 순위{' '}
                    <span className="font-mono font-bold">
                      {s.myRank}/{s.participantCount}
                    </span>
                  </span>
                </span>
              </span>
            </Link>
            )
          ) : (
            <button
              key={`e${i}`}
              type="button"
              disabled={exhausted}
              onClick={() => setPicking(true)}
              className="flex h-[84px] w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-zinc-300 px-5 text-xs text-zinc-500 disabled:opacity-40 dark:border-zinc-700"
            >
              <span className="text-base">＋</span> {exhausted ? '오늘 한도 소진' : '레이드 소환'}
            </button>
          ),
        )}
      </div>

      {/* 참여 가능한 레이드 — 초대·친구·길드 통합(중복 제거·유리한 경로 선택은 page에서).
          행 클릭 = 상세 관전(참가/요청은 상세에서). */}
      <RaidListSection title="참여 가능한 레이드" raids={openRaids} />

      {picking ? (
        // 공용 셸로 — Esc·포커스 확보. 연출은 그대로 두고 껍데기만 교체(2026-07-29 점검).
        <ModalShell
          onClose={() => !pending && (setPicking(false), setPicked(null), setConfirm(false))}
          onSubmit={
            picked
              ? () => {
                  if (pending) return;
                  if (!confirm) {
                    setConfirm(true);
                    setConfirmLeft(3);
                    return;
                  }
                  setConfirm(false);
                  open(picked);
                }
              : undefined
          }
          label="레이드 보스 선택"
        >
          <ModalLayout
            title={picked ? RAID_BOSSES[picked].name : '보스 선택'}
            subtitle={
              picked ? (
                <span className="font-mono font-bold text-sky-500">
                  💎 {openCost.toLocaleString()}
                </span>
              ) : (
                `${RAID_BOSS_CODES.length}종`
              )
            }
            maxBodyClass="max-h-[64vh]"
            footer={
              picked ? (
                <><button
                    type="button"
                    disabled={pending}
                    onClick={() => {
                      if (pending) return;
                      // 1차 탭=3초 컨펌 무장, 2차 탭(3초 내)=실제 소환(다이아 지불).
                      // 부족이면 컨펌 진입 전에 충전 유도 팝업(2026-08-22) — 3초 컨펌까지
                      // 갔다가 실패하는 헛걸음 제거.
                      if (!gate.ensure(openCost)) return;
                      if (!confirm) {
                        setConfirm(true);
                        setConfirmLeft(3);
                        return;
                      }
                      setConfirm(false);
                      open(picked);
                    }}
                    className="relative isolate flex w-full items-center justify-center overflow-hidden rounded-full bg-zinc-900 px-3 py-2.5 text-xs font-bold text-white transition-colors disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-950"
                  >
                    {confirm ? (
                      // 배경은 기존(흰색) 유지 + 펄스만 — 중성 톤 오버레이로 흰 배경 위 은은한 펄스.
                      <span
                        aria-hidden
                        className="absolute inset-0 bg-zinc-900/10"
                        style={{ animation: 'confirm-bg-pulse 1.2s ease-in-out infinite' }}
                      />
                    ) : null}
                    <span className="relative">
                      {pending
                        ? '소환 중…'
                        : confirm
                          ? `💎 ${openCost.toLocaleString()} 지불하고 소환 ${confirmLeft}s`
                          : `💎 ${openCost.toLocaleString()} 지불하고 소환`}
                    </span>
                  </button>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => {
                      setPicked(null);
                      setConfirm(false);
                    }}
                    className="w-full rounded-xl border border-zinc-300 py-2 text-[11px] font-bold text-zinc-500 dark:border-zinc-600 dark:text-zinc-400"
                  >
                    다른 보스
                  </button>
                </>
              ) : (
                <ModalButton tone="ghost" onClick={() => setPicking(false)}>
                  닫기
                </ModalButton>
              )
            }
          >
            {!picked ? (
                <div className="grid grid-cols-3 gap-1.5">
                  {RAID_BOSS_CODES.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setPicked(c)}
                      className="flex flex-col items-center gap-1 rounded-lg border border-zinc-300 p-2 text-[10px] dark:border-zinc-700"
                    >
                      <BossSprite code={c} size={48} />
                      {RAID_BOSSES[c].name}
                    </button>
                  ))}
                </div>
            ) : (
              <>
                {/* 보스 스프라이트 + 이야기를 가로로 — 시트가 스크롤 없이 들어가게(실기기 피드백 09-03). */}
                <div className="flex items-center gap-3 rounded-xl bg-amber-50/60 p-2.5 dark:bg-amber-950/20">
                  <BossSprite code={picked} size={64} />
                  <p className="min-w-0 flex-1 text-[11px] leading-snug break-keep text-zinc-600 dark:text-zinc-300">
                    {RAID_BOSSES[picked].story}
                  </p>
                </div>
                <div className="mt-2 space-y-1.5">
                  <TierRows value={tier} onChange={setTier} />
                  <DurationRow value={durationMs} onChange={setDurationMs} />
                  <ShareModeRow title="친구 공개" value={friendShare} onChange={setFriendShare} />
                  <ShareModeRow title="길드원 공개" value={guildShare} onChange={setGuildShare} />
                </div>
              </>
            )}
          </ModalLayout>
        </ModalShell>
      ) : null}
      {gate.modal}
    </>
  );
}
