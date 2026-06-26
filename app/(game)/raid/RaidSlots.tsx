'use client';

import Link from 'next/link';
import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import { RAID_OPEN_COST_DIAMOND } from '@/lib/game/balance';
import { RAID_BOSSES, RAID_BOSS_CODES, type RaidBoss } from '@/lib/game/raid/bosses';
import { BossSprite } from '@/components/BossSprite';
import { useResourceToast } from '@/components/ResourceToast';
import { getBossBg, getBossBgClass, getBossShadow } from '@/lib/game/raid/boss-sprites';
import { assetUrl } from '@/lib/asset-versions';

import { openRaidAction, joinRaidAction } from './actions';

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
      boxes: { weapon: number; armor: number; accessory: number };
      phasesCleared: number;
      myRank: number;
      participantCount: number;
    };

/** 친구/길드가 소환한 활성 레이드 — /raid 하단 목록. */
export type FriendRaid = {
  raidId: string;
  bossCode: RaidBoss;
  shareCode: string;
  expireAtIso: string;
  phasesCleared: number;
  hostNickname: string;
  participantCount: number;
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
            className={`rounded-md px-2 py-0.5 text-[11px] font-bold transition ${
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

/** 친구/길드 소환 레이드 목록 섹션 — 비면 미노출. onJoin(shareCode)로 참가/요청. */
function RaidListSection({
  title,
  raids,
  pending,
  onJoin,
}: {
  title: string;
  raids: FriendRaid[];
  pending: boolean;
  onJoin: (shareCode: string) => void;
}) {
  if (raids.length === 0) return null;
  return (
    <section className="mt-5">
      <h2 className="mb-2 text-[12px] font-bold text-zinc-500">{title}</h2>
      <div className="space-y-2">
        {raids.map((f) => (
          <button
            key={f.raidId}
            type="button"
            disabled={pending}
            onClick={() => onJoin(f.shareCode)}
            style={{ boxShadow: getBossShadow(f.bossCode) }}
            className={`relative flex w-full items-center gap-3 isolate overflow-hidden rounded-xl border-2 border-emerald-700/50 bg-gradient-to-r p-3 text-left text-zinc-100 transition active:scale-[0.99] disabled:opacity-60 ${getBossBgClass(f.bossCode)}`}
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
                <span className="ml-1 text-[11px] font-medium text-emerald-300">
                  {f.hostNickname}
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
            <span className="relative shrink-0 rounded-lg bg-emerald-500 px-2.5 py-1.5 text-[12px] font-bold text-white">
              참가
            </span>
          </button>
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
  friendRaids = [],
  guildRaids = [],
}: {
  cells: RaidSlotCell[];
  slots: number;
  dailyUsed: number;
  dailyCap: number;
  friendRaids?: FriendRaid[];
  guildRaids?: FriendRaid[];
}) {
  const router = useRouter();
  const { showError, showHeaderToast } = useResourceToast();
  const [pending, startTransition] = useTransition();
  const [picking, setPicking] = useState(false);
  const [picked, setPicked] = useState<RaidBoss | null>(null);
  const [friendShare, setFriendShare] = useState<ShareMode>('off');
  const [guildShare, setGuildShare] = useState<ShareMode>('off');
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

  const open = (code: RaidBoss) =>
    startTransition(async () => {
      const r = await openRaidAction(code, friendShare, guildShare);
      if (r.status === 'error') {
        showError(r.message);
        return;
      }
      // 팝업은 닫지 않고 상세로 이동 — 페이지 전환 시 자연 unmount(전환 중 깜빡임 방지).
      router.push(`/raid/${r.raidId}`);
    });

  const join = (shareCode: string, scope: 'friend' | 'guild') =>
    startTransition(async () => {
      const r = await joinRaidAction(shareCode, scope);
      if (r.status === 'error') {
        showError(r.message);
        return;
      }
      if (r.state === 'requested') {
        showHeaderToast({ title: '참가 요청을 보냈어요', detail: '개설자가 수락하면 참여됩니다' });
        return;
      }
      router.push(`/raid/${r.raidId}`);
    });

  return (
    <>
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
              <Link
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
            <Link
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

      {/* 친구/길드가 소환한 레이드 — 공개·활성. 자유=즉시, 수락=요청. */}
      <RaidListSection
        title="친구가 소환한 레이드"
        raids={friendRaids}
        pending={pending}
        onJoin={(sc) => join(sc, 'friend')}
      />
      <RaidListSection
        title="길드가 소환한 레이드"
        raids={guildRaids}
        pending={pending}
        onJoin={(sc) => join(sc, 'guild')}
      />

      {picking ? (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-md"
          onClick={() => !pending && (setPicking(false), setPicked(null), setConfirm(false))}
        >
          <div
            className="w-full max-w-xs rounded-2xl border-2 border-amber-300 bg-white p-4 shadow-[0_0_40px_rgba(245,158,11,0.18)] dark:border-amber-800 dark:bg-zinc-950"
            onClick={(e) => e.stopPropagation()}
          >
            {!picked ? (
              <>
                <h3 className="text-center text-sm font-bold">보스 선택</h3>
                <div className="mt-3 grid grid-cols-3 gap-1.5">
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
                <button
                  type="button"
                  onClick={() => setPicking(false)}
                  className="mt-3 w-full py-1.5 text-[11px] text-zinc-500"
                >
                  닫기
                </button>
              </>
            ) : (
              <>
                <div className="flex justify-center">
                  <BossSprite code={picked} size={96} />
                </div>
                <h3 className="mt-1 text-center text-base font-bold">
                  {RAID_BOSSES[picked].name}
                </h3>
                <p className="mt-2 rounded-xl bg-amber-50/60 p-3 text-[11px] leading-relaxed break-keep text-zinc-600 dark:bg-amber-950/20 dark:text-zinc-300">
                  {RAID_BOSSES[picked].story}
                </p>
                <div className="mt-3 space-y-1.5">
                  <ShareModeRow title="친구 공개" value={friendShare} onChange={setFriendShare} />
                  <ShareModeRow title="길드원 공개" value={guildShare} onChange={setGuildShare} />
                </div>
                <div className="mt-2 space-y-1.5">
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => {
                      if (pending) return;
                      // 1차 탭=3초 컨펌 무장, 2차 탭(3초 내)=실제 소환(다이아 지불).
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
                          ? `💎 ${RAID_OPEN_COST_DIAMOND.toLocaleString()} 지불하고 소환 ${confirmLeft}s`
                          : `💎 ${RAID_OPEN_COST_DIAMOND.toLocaleString()} 지불하고 소환`}
                    </span>
                  </button>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => {
                      setPicked(null);
                      setConfirm(false);
                    }}
                    className="w-full py-1.5 text-[11px] text-zinc-500"
                  >
                    다른 보스
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
