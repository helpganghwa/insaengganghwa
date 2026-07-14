'use client';

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { assetUrl } from '@/lib/asset-versions';
import { useResourceToast } from '@/components/ResourceToast';
import { useDiamond } from '@/components/DiamondContext';
import {
  CHALLENGE_GROUPS,
  COMPLETE_BONUS,
  activeChallenges,
  type ChallengeDef,
} from '@/lib/game/challenges/defs';

import { claimChallengeAction } from './actions';

/** 그룹 배너 픽셀아트(기존 홈 카드 에셋 재활용) — 없는 그룹은 그라데이션 폴백. */
const GROUP_BG: Partial<Record<string, string>> = {
  supply: '/sprites/hub/gacha.png',
  equip: '/sprites/hub/inventory.png',
  enhance: '/sprites/hub/enhance.png',
  daily: '/sprites/hub/mail.png',
  growth: '/sprites/hub/box-weapon.png',
  social: '/sprites/hub/melee.png',
  guild: '/sprites/hub/guild.png',
  raid: '/sprites/hub/raid.png',
  world: '/sprites/guild/worldmap.png',
  avatar: '/sprites/default/female/south.png',
  shop: '/sprites/hub/shop.png',
};

/**
 * 도전 과제 화면 — 전 과제 한눈에 + 항목별 개별 수령 + 전체 완료 특별 보상(2026-07-14).
 * 리텐션 핵심 콘텐츠: 수령 가능 항목은 앰버 글로우로 유혹하고, 미달성 항목엔 '하러 가기'
 * 동선을 붙여 "보상 보인다 → 눌러본다 → 콘텐츠 한 바퀴"를 만든다. 수령은 낙관 UI
 * (즉시 체크 + 헤더 다이아 반영) + 서버 재검증(실패 시 롤백).
 */
export function ChallengesClient({
  done,
  claimedInit,
  completeClaimed: completeClaimedInit,
  hidePaid,
}: {
  done: Record<string, boolean>;
  claimedInit: string[];
  completeClaimed: boolean;
  hidePaid: boolean;
}) {
  const router = useRouter();
  const { showError, showHeaderToast } = useResourceToast();
  const { optimisticAdjust } = useDiamond();
  const [claimed, setClaimed] = useState<Set<string>>(() => new Set(claimedInit));
  const [completeClaimed, setCompleteClaimed] = useState(completeClaimedInit);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, start] = useTransition();

  const list = useMemo(() => activeChallenges(hidePaid), [hidePaid]);
  const groups = useMemo(
    () => CHALLENGE_GROUPS.filter((g) => list.some((c) => c.group === g.id)),
    [list],
  );

  const claimedCount = list.filter((c) => claimed.has(c.id)).length;
  const claimableCount =
    list.filter((c) => done[c.id] && !claimed.has(c.id)).length;
  const completeReady = claimedCount === list.length && !completeClaimed;
  const progress = Math.round((claimedCount / list.length) * 100);

  const claim = (id: string, diamond: number) => {
    if (pendingId) return;
    setPendingId(id);
    // 낙관 — 즉시 체크 + 헤더 다이아 반영(실패 시 롤백).
    const isComplete = id === COMPLETE_BONUS.id;
    if (isComplete) setCompleteClaimed(true);
    else setClaimed((s) => new Set(s).add(id));
    optimisticAdjust(BigInt(diamond));
    start(async () => {
      const r = await claimChallengeAction(id);
      setPendingId(null);
      if (r.status !== 'success') {
        if (isComplete) setCompleteClaimed(false);
        else
          setClaimed((s) => {
            const n = new Set(s);
            n.delete(id);
            return n;
          });
        optimisticAdjust(BigInt(-diamond));
        showError(r.message);
        return;
      }
      showHeaderToast({
        title: `💎 ${r.diamond.toLocaleString('ko-KR')} 획득!`,
        detail: r.boxes ? `보급상자 ${r.boxes.weapon + r.boxes.armor + r.boxes.accessory}개 지급` : undefined,
      });
      router.refresh();
    });
  };

  return (
    <div className="px-4 py-4 pb-24">
      {/* ── 헤더 + 전체 진행 ── */}
      <div className="flex items-baseline justify-between">
        <h1 className="text-lg font-extrabold">🏆 도전 과제</h1>
        <span className="text-[12px] tabular-nums text-zinc-500">
          {claimedCount}/{list.length} 완료
        </span>
      </div>
      <p className="mt-0.5 text-[12px] text-zinc-500">
        인생강화의 모든 콘텐츠를 정복하고 보상을 받아보세요 — 각 과제는 한 번만!
      </p>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
        <div
          className="h-full rounded-full bg-gradient-to-r from-amber-400 to-orange-500 transition-all duration-500"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* ── 전체 완료 특별 보상 — 항상 보이는 최종 목표 ── */}
      <div
        className={`mt-3 rounded-2xl border-2 p-3.5 transition ${
          completeReady
            ? 'border-amber-400 bg-gradient-to-r from-amber-50 to-orange-50 shadow-[0_0_24px_rgba(245,158,11,0.25)] dark:from-amber-950/40 dark:to-orange-950/30'
            : completeClaimed
              ? 'border-emerald-300/60 bg-emerald-50/50 dark:border-emerald-800 dark:bg-emerald-950/20'
              : 'border-zinc-200 dark:border-zinc-800'
        }`}
      >
        <div className="flex items-center gap-3">
          <span className="text-3xl">{completeClaimed ? '👑' : '🎁'}</span>
          <div className="min-w-0 flex-1">
            <div className="text-[14px] font-extrabold">{COMPLETE_BONUS.label}</div>
            <div className="mt-0.5 flex items-center gap-1 text-[12px] text-zinc-500">
              💎 {COMPLETE_BONUS.diamond.toLocaleString('ko-KR')} +
              {(['weapon', 'armor', 'accessory'] as const).map((b) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={b}
                  src={assetUrl(`/sprites/hub/box-${b}.png`)}
                  alt=""
                  aria-hidden
                  className="h-5 w-5 object-contain"
                  style={{ imageRendering: 'pixelated' }}
                />
              ))}
              <span>각 {COMPLETE_BONUS.boxes.weapon}개</span>
            </div>
          </div>
          {completeClaimed ? (
            <span className="shrink-0 text-[12px] font-bold text-emerald-600 dark:text-emerald-400">
              수령 완료 ✓
            </span>
          ) : completeReady ? (
            <button
              type="button"
              disabled={pendingId != null}
              onClick={() => claim(COMPLETE_BONUS.id, COMPLETE_BONUS.diamond)}
              className="shrink-0 animate-pulse rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 px-4 py-2 text-[13px] font-extrabold text-white shadow-lg disabled:opacity-50"
            >
              받기!
            </button>
          ) : (
            <span className="shrink-0 rounded-full bg-zinc-100 px-2.5 py-1 text-[11px] font-bold tabular-nums text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
              {claimedCount}/{list.length}
            </span>
          )}
        </div>
      </div>

      {claimableCount > 0 ? (
        <p className="mt-3 text-[12px] font-semibold text-amber-600 dark:text-amber-400">
          ✨ 지금 받을 수 있는 보상 {claimableCount}개
        </p>
      ) : null}

      {/* ── 그룹별 과제 목록 ── */}
      <div className="mt-2 space-y-4">
        {groups.map((g) => (
          <section key={g.id}>
            <div className="isolate overflow-hidden rounded-2xl border border-zinc-200 dark:border-zinc-800">
              {/* 그룹 배너 — 홈 카드 픽셀아트 재활용(cover + 어둠 그라데이션) */}
              <div className="relative h-12 overflow-hidden bg-zinc-900">
                {GROUP_BG[g.id] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={assetUrl(GROUP_BG[g.id]!)}
                    alt=""
                    aria-hidden
                    draggable={false}
                    className="absolute inset-0 h-full w-full object-cover opacity-80"
                    style={{ imageRendering: 'pixelated', objectPosition: 'center 30%' }}
                  />
                ) : null}
                <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/45 to-black/20" />
                <div className="absolute inset-y-0 left-3 flex items-center gap-1.5">
                  <span className="text-[14px]">{g.icon}</span>
                  <span className="text-[13px] font-extrabold text-white drop-shadow">{g.label}</span>
                </div>
              </div>
              {list
                .filter((c) => c.group === g.id)
                .map((c, i, arr) => (
                  <Row
                    key={c.id}
                    def={c}
                    state={claimed.has(c.id) ? 'claimed' : done[c.id] ? 'ready' : 'todo'}
                    last={i === arr.length - 1}
                    pending={pendingId === c.id}
                    anyPending={pendingId != null}
                    onClaim={() => claim(c.id, c.diamond)}
                  />
                ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

function Row({
  def,
  state,
  last,
  pending,
  anyPending,
  onClaim,
}: {
  def: ChallengeDef;
  state: 'claimed' | 'ready' | 'todo';
  last: boolean;
  pending: boolean;
  anyPending: boolean;
  onClaim: () => void;
}) {
  return (
    <div
      className={`flex items-center gap-2.5 px-3 py-2.5 ${last ? '' : 'border-b border-zinc-100 dark:border-zinc-900'} ${
        state === 'ready' ? 'bg-amber-50/70 dark:bg-amber-950/20' : ''
      }`}
    >
      {/* 상태 아이콘 */}
      <span
        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[12px] font-bold ${
          state === 'claimed'
            ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400'
            : state === 'ready'
              ? 'bg-amber-400 text-white shadow-[0_0_10px_rgba(245,158,11,0.5)]'
              : 'bg-zinc-100 text-zinc-400 dark:bg-zinc-800 dark:text-zinc-500'
        }`}
      >
        {state === 'claimed' ? '✓' : state === 'ready' ? '!' : ''}
      </span>

      {/* 라벨 + 보상 */}
      <div className="min-w-0 flex-1">
        <div
          className={`text-[13px] font-semibold ${
            state === 'claimed' ? 'text-zinc-400 line-through decoration-zinc-300 dark:decoration-zinc-600' : ''
          }`}
        >
          {def.label}
        </div>
        <div className="text-[11px] tabular-nums text-zinc-400">
          💎 {def.diamond.toLocaleString('ko-KR')}
        </div>
      </div>

      {/* 액션 */}
      {state === 'ready' ? (
        <button
          type="button"
          disabled={anyPending}
          onClick={onClaim}
          className="shrink-0 rounded-lg bg-amber-500 px-3 py-1.5 text-[12px] font-bold text-white shadow active:scale-95 disabled:opacity-50"
        >
          {pending ? '수령 중…' : '받기'}
        </button>
      ) : state === 'todo' ? (
        <Link
          href={def.go}
          className="shrink-0 rounded-lg border border-zinc-200 px-2.5 py-1.5 text-[11px] font-semibold text-zinc-500 active:scale-95 dark:border-zinc-700 dark:text-zinc-400"
        >
          바로가기
        </Link>
      ) : null}
    </div>
  );
}
