'use client';

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';

import { ModalShell } from '@/components/ModalShell';
import { ModalLayout, ModalButton } from '@/components/ModalLayout';
import { useResourceToast } from '@/components/ResourceToast';
import { PageHeader } from '@/components/ui/PageHeader';
import { useDiamondActions } from '@/components/DiamondContext';
import { InstallAppButton } from '@/app/(game)/me/settings/InstallAppButton';
import {
  CHALLENGES,
  CHALLENGE_GROUPS,
  COMPLETE_BONUS,
  isChallengeLocked,
  type ChallengeDef,
  type ChallengeGroup,
} from '@/lib/game/challenges/defs';

import { claimChallengeAction, claimAllChallengesAction } from './actions';

/**
 * 도전 과제 화면 — 전 과제 한눈에 + 개별 수령 + 전체 완료 특별 보상(2026-07-14).
 * 컴팩트 1줄 행 + CSS 그룹 헤더(이미지는 홈 배너만 — 2026-07-15 피드백). 미달성 과제는
 * '가이드' 팝업으로 달성 방법을 안내하고 하단에 상황 맞는 버튼(바로가기/앱 설치)을 노출.
 * 수령은 낙관 UI(즉시 체크 + 헤더 다이아 반영, 실패 롤백).
 * 잠김 과제(결제 닫힘 = 상점 과제)도 목록에 남긴다 — 분모가 항상 전 과제라, 안 보이면
 * 완주가 왜 안 열리는지 알 수 없다(2026-08-12).
 */

/** 과제가 있는 그룹만(정의 순서 유지) — 목록은 잠김 포함 전 과제 고정. */
const GROUPS = CHALLENGE_GROUPS.filter((g) => CHALLENGES.some((c) => c.group === g.id));

/** 잠김 과제 안내 — 상점이 닫혀 있어 달성 자체가 불가(가이드 본문 대체). */
const LOCKED_GUIDE = '상점이 아직 열리지 않았어요. 열리면 바로 도전할 수 있어요.';

/** 그룹 CSS 틴트 — 이미지 없이 색으로 구분(컴팩트·가독성). */
const GROUP_TINT: Record<ChallengeGroup, string> = {
  supply: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  equip: 'bg-sky-500/10 text-sky-600 dark:text-sky-400',
  enhance: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  daily: 'bg-violet-500/10 text-violet-600 dark:text-violet-400',
  growth: 'bg-fuchsia-500/10 text-fuchsia-600 dark:text-fuchsia-400',
  app: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  social: 'bg-pink-500/10 text-pink-600 dark:text-pink-400',
  guild: 'bg-orange-500/10 text-orange-600 dark:text-orange-400',
  raid: 'bg-red-500/10 text-red-600 dark:text-red-400',
  world: 'bg-teal-500/10 text-teal-600 dark:text-teal-400',
  avatar: 'bg-purple-500/10 text-purple-600 dark:text-purple-400',
  shop: 'bg-lime-500/10 text-lime-600 dark:text-lime-400',
};

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
  const { showError, showHeaderToast } = useResourceToast();
  const { optimisticAdjust } = useDiamondActions();
  const [claimed, setClaimed] = useState<Set<string>>(() => new Set(claimedInit));
  const [completeClaimed, setCompleteClaimed] = useState(completeClaimedInit);
  const [pendingIds, setPendingIds] = useState<Set<string>>(() => new Set());
  const [guideFor, setGuideFor] = useState<ChallengeDef | null>(null);
  const [, start] = useTransition();

  const locked = useMemo(
    () => new Set(CHALLENGES.filter((c) => isChallengeLocked(c, hidePaid)).map((c) => c.id)),
    [hidePaid],
  );

  const total = CHALLENGES.length;
  const claimedCount = CHALLENGES.filter((c) => claimed.has(c.id)).length;
  const claimableCount = CHALLENGES.filter(
    (c) => !locked.has(c.id) && done[c.id] && !claimed.has(c.id),
  ).length;
  const completeReady = claimedCount === total && !completeClaimed;
  const progress = Math.round((claimedCount / total) * 100);

  const claim = (id: string, diamond: number) => {
    if (pendingIds.has(id)) return;
    setPendingIds((p) => new Set(p).add(id));
    const isComplete = id === COMPLETE_BONUS.id;
    if (isComplete) setCompleteClaimed(true);
    else setClaimed((s) => new Set(s).add(id));
    optimisticAdjust(BigInt(diamond));
    start(async () => {
      const r = await claimChallengeAction(id);
      setPendingIds((p) => {
        const n = new Set(p);
        n.delete(id);
        return n;
      });
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
        detail: r.boxes
          ? `보급상자 ${r.boxes.weapon + r.boxes.armor + r.boxes.accessory}개 지급`
          : undefined,
      });
      // router.refresh 없음 — 로컬 낙관 상태가 진실과 일치(서버 멱등 수령 성공 시).
    });
  };

  // 일괄 수령 — 달성 & 미수령 전량(완료 보너스 제외, 단일 트랜잭션). 낙관 처리 동일.
  const claimAll = () => {
    if (pendingIds.has('__all__')) return;
    const targets = CHALLENGES.filter(
      (c) => !locked.has(c.id) && done[c.id] && !claimed.has(c.id) && !pendingIds.has(c.id),
    );
    if (targets.length === 0) return;
    const totalDiamond = targets.reduce((a, c) => a + c.diamond, 0);
    setPendingIds((p) => new Set(p).add('__all__'));
    setClaimed((s) => new Set([...s, ...targets.map((c) => c.id)]));
    optimisticAdjust(BigInt(totalDiamond));
    start(async () => {
      const r = await claimAllChallengesAction();
      setPendingIds((p) => {
        const n = new Set(p);
        n.delete('__all__');
        return n;
      });
      if (r.status !== 'success') {
        setClaimed((s) => {
          const n = new Set(s);
          for (const c of targets) n.delete(c.id);
          return n;
        });
        optimisticAdjust(BigInt(-totalDiamond));
        showError(r.message);
        return;
      }
      showHeaderToast({
        title: `💎 ${r.diamond.toLocaleString('ko-KR')} 획득!`,
        detail: r.boxes
          ? `과제 ${r.count}개 · 보급상자 ${r.boxes.weapon + r.boxes.armor + r.boxes.accessory}개 지급`
          : `과제 ${r.count}개 수령`,
      });
    });
  };

  return (
    <div className="px-4 pb-24 pt-3">
      {/* ── 헤더 + 전체 진행 ── */}
      <PageHeader
        title="도전 과제"
        fallback="/me"
        right={
          <span className="text-[12px] tabular-nums text-zinc-500">
            {claimedCount}/{total}
          </span>
        }
      />
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
        <div
          className="h-full rounded-full bg-gradient-to-r from-amber-400 to-orange-500 transition-all duration-500"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* ── 전체 완료 특별 보상 ── */}
      <div
        className={`mt-3 rounded-xl border-2 px-3 py-2.5 transition ${
          completeReady
            ? 'border-amber-400 bg-gradient-to-r from-amber-50 to-orange-50 shadow-[0_0_24px_rgba(245,158,11,0.25)] dark:from-amber-950/40 dark:to-orange-950/30'
            : completeClaimed
              ? 'border-emerald-300/60 bg-emerald-50/50 dark:border-emerald-800 dark:bg-emerald-950/20'
              : 'border-zinc-200 dark:border-zinc-800'
        }`}
      >
        <div className="flex items-center gap-2.5">
          <span className="text-2xl">{completeClaimed ? '👑' : '🎁'}</span>
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-extrabold">{COMPLETE_BONUS.label}</div>
            <div className="text-[11px] tabular-nums text-zinc-500">
              💎 {COMPLETE_BONUS.diamond.toLocaleString('ko-KR')} + 📦{' '}
              {COMPLETE_BONUS.boxes.weapon + COMPLETE_BONUS.boxes.armor + COMPLETE_BONUS.boxes.accessory}
            </div>
          </div>
          {completeClaimed ? (
            <span className="shrink-0 text-[12px] font-bold text-emerald-600 dark:text-emerald-400">✓</span>
          ) : completeReady ? (
            <button
              type="button"
              disabled={pendingIds.has(COMPLETE_BONUS.id)}
              onClick={() => claim(COMPLETE_BONUS.id, COMPLETE_BONUS.diamond)}
              className="shrink-0 animate-pulse rounded-lg bg-gradient-to-r from-amber-500 to-orange-500 px-3.5 py-1.5 text-[12px] font-extrabold text-white shadow-lg disabled:opacity-50"
            >
              받기!
            </button>
          ) : (
            <span className="shrink-0 rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-bold tabular-nums text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
              {claimedCount}/{total}
            </span>
          )}
        </div>
        {/* 완주가 막힌 이유 — 잠김 과제가 남으면 분모를 채울 수 없다(숨기지 않는 이유). */}
        {locked.size > 0 && !completeClaimed ? (
          <p className="mt-1.5 text-[11px] text-zinc-500">
            🔒 상점 과제 {locked.size}개가 잠겨 있어요
          </p>
        ) : null}
      </div>

      {claimableCount > 0 ? (
        <div className="mt-2.5 flex items-center justify-between gap-2">
          <p className="text-[12px] font-semibold text-amber-600 dark:text-amber-400">
            ✨ 지금 받을 수 있는 보상 {claimableCount}개
          </p>
          <button
            type="button"
            disabled={pendingIds.has('__all__')}
            onClick={claimAll}
            className="shrink-0 rounded-lg bg-amber-500 px-3 py-1 text-[11px] font-bold text-white shadow active:scale-95 disabled:opacity-50"
          >
            {pendingIds.has('__all__') ? '수령 중…' : '모두 받기'}
          </button>
        </div>
      ) : null}

      {/* ── 그룹별 과제 목록 — CSS 헤더 + 컴팩트 1줄 행 ── */}
      <div className="mt-2 space-y-2.5">
        {GROUPS.map((g) => (
          <section
            key={g.id}
            className="overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800"
          >
            <div className={`flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-bold ${GROUP_TINT[g.id]}`}>
              <span>{g.icon}</span>
              {g.label}
            </div>
            {CHALLENGES.filter((c) => c.group === g.id).map((c) => (
              <Row
                key={c.id}
                def={c}
                state={
                  claimed.has(c.id)
                    ? 'claimed'
                    : locked.has(c.id)
                      ? 'locked'
                      : done[c.id]
                        ? 'ready'
                        : 'todo'
                }
                pending={pendingIds.has(c.id)}
                onClaim={() => claim(c.id, c.diamond)}
                onGuide={() => setGuideFor(c)}
              />
            ))}
          </section>
        ))}
      </div>

      {/* ── 가이드 팝업 — 달성 방법 + 상황 맞는 하단 버튼 ── */}
      {guideFor ? (
        <ModalShell onClose={() => setGuideFor(null)} label={`${guideFor.label} 가이드`}>
          <ModalLayout
            icon={CHALLENGE_GROUPS.find((g) => g.id === guideFor.group)?.icon}
            title={guideFor.label}
            subtitle={
              <span className="font-bold tabular-nums text-amber-600 dark:text-amber-400">
                💎 {guideFor.diamond.toLocaleString('ko-KR')}
                {guideFor.boxes ? ` + 📦 ${guideFor.boxes}` : ''}
              </span>
            }
            footer={
              guideFor.id === 'app_install' ? (
                <div className="isolate flex-1 overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-700">
                  <InstallAppButton />
                </div>
              ) : locked.has(guideFor.id) ? (
                // 잠김 — 바로가기(상점)는 닫혀 있어 눌러도 '준비 중' 화면이라 노출하지 않는다.
                <ModalButton tone="neutral" onClick={() => setGuideFor(null)}>
                  닫기
                </ModalButton>
              ) : (
                <>
                  <ModalButton tone="neutral" onClick={() => setGuideFor(null)}>
                    닫기
                  </ModalButton>
                  <Link
                    prefetch={false}
                    href={guideFor.go}
                    className="flex-1 rounded-xl bg-amber-600 py-2.5 text-center text-[13px] font-bold text-white active:opacity-90"
                  >
                    바로가기
                  </Link>
                </>
              )
            }
          >
            <p className="text-[13px] leading-relaxed text-zinc-600 dark:text-zinc-300">
              {locked.has(guideFor.id) ? LOCKED_GUIDE : guideFor.guide}
            </p>
          </ModalLayout>
        </ModalShell>
      ) : null}
    </div>
  );
}

function Row({
  def,
  state,
  pending,
  onClaim,
  onGuide,
}: {
  def: ChallengeDef;
  state: 'claimed' | 'ready' | 'todo' | 'locked';
  pending: boolean;
  onClaim: () => void;
  onGuide: () => void;
}) {
  return (
    <div
      className={`flex items-center gap-2 border-t border-zinc-100 px-3 py-1.5 dark:border-zinc-900 ${
        state === 'ready' ? 'bg-amber-50/70 dark:bg-amber-950/20' : ''
      }`}
    >
      {/* 상태 점 */}
      <span
        className={`h-1.5 w-1.5 shrink-0 rounded-full ${
          state === 'claimed'
            ? 'bg-emerald-500'
            : state === 'ready'
              ? 'bg-amber-500 shadow-[0_0_6px_rgba(245,158,11,0.8)]'
              : 'bg-zinc-300 dark:bg-zinc-700'
        }`}
      />
      <span
        className={`min-w-0 flex-1 truncate text-[13px] ${
          state === 'claimed'
            ? 'text-zinc-400 line-through decoration-zinc-300 dark:decoration-zinc-600'
            : state === 'locked'
              ? 'text-zinc-400 dark:text-zinc-500'
              : 'font-medium'
        }`}
      >
        {def.label}
      </span>
      <span className="shrink-0 text-[11px] tabular-nums text-zinc-400">
        💎{def.diamond.toLocaleString('ko-KR')}
        {def.boxes ? <span className="ml-1">📦{def.boxes}</span> : null}
      </span>
      {/* 액션 — 세 상태 모두 동일 박스(w-14 h-6)로 레이아웃 시프트 방지(2026-07-15). */}
      {state === 'ready' ? (
        <button
          type="button"
          disabled={pending}
          onClick={onClaim}
          className="flex h-6 w-14 shrink-0 items-center justify-center rounded-md bg-amber-500 text-[11px] font-bold text-white shadow active:scale-95 disabled:opacity-50"
        >
          {pending ? '…' : '받기'}
        </button>
      ) : state === 'todo' ? (
        <button
          type="button"
          onClick={onGuide}
          className="flex h-6 w-14 shrink-0 items-center justify-center rounded-md border border-zinc-200 text-[11px] font-semibold text-zinc-500 active:scale-95 dark:border-zinc-700 dark:text-zinc-400"
        >
          가이드
        </button>
      ) : state === 'locked' ? (
        // 잠김도 눌러 이유를 볼 수 있게 — 버튼을 죽이면 왜 못 하는지 알 길이 없다.
        <button
          type="button"
          onClick={onGuide}
          className="flex h-6 w-14 shrink-0 items-center justify-center rounded-md border border-dashed border-zinc-200 text-[11px] font-semibold text-zinc-400 active:scale-95 dark:border-zinc-700 dark:text-zinc-500"
        >
          🔒 잠김
        </button>
      ) : (
        <span className="flex h-6 w-14 shrink-0 items-center justify-center text-[11px] font-bold text-emerald-500">✓</span>
      )}
    </div>
  );
}
