'use client';

import { useEffect, useMemo, useOptimistic, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

import type { Slot } from '@/lib/db/schema/equipment';
import { useDiamond } from '@/components/DiamondContext';
import { useResourceToast, type HeaderReward } from '@/components/ResourceToast';
import {
  claimMailAction,
  claimAllMailAction,
  loadMoreMailsAction,
} from './actions';
// 수령 피드백: 공용 헤더 토스트(showHeaderToast) 첫 테스트 적용(2026-06-04). 헤더를 덮는
// 슬라이드 바로 '우편 수령 │ 보상' 노출. (이전 2026-06-01엔 토스트 제거 상태였음 — 헤더
// 다이아 + 우편 사라짐만으로 인지. 새 헤더 토스트 패턴 검증을 위해 재도입.)

export type MailItem = {
  id: string;
  type: string;
  title: string;
  body: string;
  senderLabel: string;
  payload: { diamond?: number | string; boxes?: Partial<Record<Slot, number>> };
  /** 우측 배경 아바타(종류별) — 일일보급 마스코트/프로필 본인/대난투 트로피. 없으면 미표시. */
  avatar?: string | null;
  claimedAtIso: string | null;
  expiresAtIso: string;
  createdAtIso: string;
};

const SLOT_EMOJI: Record<Slot, string> = { weapon: '⚔️', armor: '🛡️', accessory: '💍' };

/** payload → 헤더 토스트 보상 칩(💎 → ⚔️ → 🛡️ → 💍 순, 0은 제외). */
function buildRewards(diamond: number, boxes: Partial<Record<Slot, number>>): HeaderReward[] {
  const out: HeaderReward[] = [];
  if (diamond > 0) out.push({ icon: '💎', amount: diamond });
  for (const s of ['weapon', 'armor', 'accessory'] as Slot[]) {
    const n = boxes[s] ?? 0;
    if (n > 0) out.push({ icon: SLOT_EMOJI[s], amount: n });
  }
  return out;
}

/**
 * type별 시각 메타(2026-06-01 추가) — 카드 좌측 컬러바 + 작은 라벨 배지.
 * 실사용 5종 + notice 폴백. 미정의 type은 zinc 톤.
 */
type TypeMeta = { bar: string; label: string; labelClass: string };
const TYPE_META: Record<string, TypeMeta> = {
  admin: {
    bar: 'bg-violet-500',
    label: '운영자',
    labelClass:
      'bg-violet-100 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300',
  },
  reward: {
    bar: 'bg-amber-500',
    label: '보상',
    labelClass:
      'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300',
  },
  profile_accepted: {
    bar: 'bg-emerald-500',
    label: '프로필 승인',
    labelClass:
      'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300',
  },
  profile_rejected_ai: {
    bar: 'bg-rose-500',
    label: '프로필 거절',
    labelClass: 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300',
  },
  profile_failed: {
    bar: 'bg-zinc-500',
    label: '프로필 실패',
    labelClass: 'bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300',
  },
  notice: {
    bar: 'bg-sky-500',
    label: '공지',
    labelClass: 'bg-sky-100 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300',
  },
};
const DEFAULT_TYPE_META: TypeMeta = {
  bar: 'bg-zinc-600',
  label: '우편',
  labelClass: 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300',
};

function fmtRemaining(targetMs: number, nowMs: number): string {
  const diff = targetMs - nowMs;
  if (diff <= 0) return '만료';
  const h = Math.floor(diff / 3_600_000);
  if (h < 24) return `${h}시간 남음`;
  const d = Math.floor(h / 24);
  return `${d}일 남음`;
}

function hasPayload(payload: MailItem['payload']): boolean {
  if (Number(payload.diamond ?? 0) > 0) return true;
  const b = payload.boxes ?? {};
  return (['weapon', 'armor', 'accessory'] as Slot[]).some((s) => (b[s] ?? 0) > 0);
}

function PayloadChips({ payload }: { payload: MailItem['payload'] }) {
  const dia = Number(payload.diamond ?? 0);
  const boxes = payload.boxes ?? {};
  return (
    <div className="flex flex-wrap gap-1.5 font-mono text-[11px] tabular-nums">
      {dia > 0 ? (
        <span className="inline-flex items-center gap-0.5 rounded-md bg-amber-100 px-1.5 py-0.5 text-amber-900 dark:bg-amber-950/60 dark:text-amber-200">
          💎 {dia.toLocaleString('ko-KR')}
        </span>
      ) : null}
      {(['weapon', 'armor', 'accessory'] as Slot[]).map((s) => {
        const n = boxes[s] ?? 0;
        if (n <= 0) return null;
        return (
          <span
            key={s}
            className="inline-flex items-center gap-0.5 rounded-md bg-zinc-100 px-1.5 py-0.5 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200"
          >
            {SLOT_EMOJI[s]} {n}
          </span>
        );
      })}
    </div>
  );
}

/** 운영자 우편 신뢰성 배지 — sender 옆 ✓ 운영자. 사칭 신고 회피용. */
function VerifiedAdminBadge() {
  return (
    <span className="inline-flex items-center gap-0.5 rounded-full bg-violet-100 px-1 text-[8.5px] font-bold text-violet-700 dark:bg-violet-950/60 dark:text-violet-300">
      <svg
        viewBox="0 0 12 12"
        aria-hidden
        className="h-2.5 w-2.5 fill-current"
      >
        <path d="M6 0l1.5 1.5L9.6 1l.6 2.1 2.1.6-.5 2.1L13 7.5 11.5 9l.6 2.1-2.1.6-.6 2.1L7.5 13 6 14.5 4.5 13l-2.1.6-.6-2.1L0 11.5 1 9 0 7.5 1.5 6 0 4.5 1 2.1 3 1.5 4.5 0 6 1.5z" />
      </svg>
      운영자
    </span>
  );
}

/**
 * 미수령 전체 합계(서버 권위) — 모두 받기 미리보기 정확도용. null이면
 * 폴백으로 displayItems 기반 합계 사용. count는 PAGE_SIZE 표시 외 포함 전체.
 */
export type UnreadAggregate = {
  count: number;
  diamond: number;
  boxes: { weapon: number; armor: number; accessory: number };
};

export function MailList({
  items,
  tab,
  unreadCount,
  hasMore: initialHasMore,
  unreadAggregate,
}: {
  items: MailItem[];
  tab: 'unread' | 'done';
  unreadCount: number | null;
  hasMore: boolean;
  unreadAggregate: UnreadAggregate | null;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [extraItems, setExtraItems] = useState<MailItem[]>([]);
  const [hasMore, setHasMore] = useState(initialHasMore);
  // 더 보기 누른 직후 skeleton 자리 N개 표시(2026-06-02) — '불러오는 중…' 텍스트 폴백
  // 대신 실제 카드 슬롯을 점유해 layout shift 최소화.
  const [loadingSkeletons, setLoadingSkeletons] = useState(0);
  // items prop이 바뀌면(claim 후 router.refresh) extras·hasMore 리셋 — 중복 방지.
  useEffect(() => {
    setExtraItems([]);
    setHasMore(initialHasMore);
  }, [items, initialHasMore]);

  const combinedBase = useMemo(() => [...items, ...extraItems], [items, extraItems]);
  const [displayItems, setOptimisticItems] = useOptimistic(combinedBase);
  const { optimisticAdjust: adjustDiamond } = useDiamond();
  const { showError, showHeaderToast } = useResourceToast();
  const nowMs = Date.now();

  // 모두 받기 합계 preview — 서버 권위 unreadAggregate 우선(전체 미수령 기준).
  // 폴백: displayItems 기반(레거시 호환, 보통 닿지 않음).
  const totals = useMemo(() => {
    if (unreadAggregate) {
      return { diamond: unreadAggregate.diamond, boxes: unreadAggregate.boxes };
    }
    let diamond = 0;
    const boxes: Record<Slot, number> = { weapon: 0, armor: 0, accessory: 0 };
    for (const m of displayItems) {
      diamond += Number(m.payload.diamond ?? 0);
      const b = m.payload.boxes ?? {};
      for (const s of ['weapon', 'armor', 'accessory'] as Slot[]) {
        boxes[s] += b[s] ?? 0;
      }
    }
    return { diamond, boxes };
  }, [displayItems, unreadAggregate]);

  // 표시 카운트: 서버 권위 + displayItems 중 작은 쪽 — optimistic clear(displayItems=0)
  // 시 카운트도 0으로 줄어 '모두 받기' 버튼이 즉시 사라짐. 정상 상태에선 unreadAggregate가
  // 표시 외 미수령 포함 전체 count이므로 큰 값 노출.
  const totalCount =
    displayItems.length === 0
      ? 0
      : Math.max(unreadAggregate?.count ?? 0, displayItems.length);

  const totalParts = useMemo(() => {
    const parts: string[] = [];
    if (totals.diamond > 0) parts.push(`💎 +${totals.diamond.toLocaleString('ko-KR')}`);
    for (const s of ['weapon', 'armor', 'accessory'] as Slot[]) {
      const n = totals.boxes[s];
      if (n > 0) parts.push(`${SLOT_EMOJI[s]} +${n}`);
    }
    return parts;
  }, [totals]);

  const claim = (id: string) => {
    setError(null);
    const target = combinedBase.find((m) => m.id === id);
    startTransition(async () => {
      // 낙관: 우편 즉시 제거 + 헤더 다이아 즉시 가산.
      if (target) {
        setOptimisticItems(displayItems.filter((m) => m.id !== id));
        const dia = Number(target.payload.diamond ?? 0);
        if (dia > 0) adjustDiamond(BigInt(dia));
      }
      const r = await claimMailAction(id);
      if (r.status === 'error') {
        if (target) {
          const dia = Number(target.payload.diamond ?? 0);
          if (dia > 0) adjustDiamond(-BigInt(dia));
        }
        setError(r.message);
        showError(r.message);
        return;
      }
      // 성공 — 공용 헤더 토스트로 '우편 수령 │ 보상' 노출(보상 없는 우편은 제목만).
      if (target) {
        showHeaderToast({
          title: '우편 수령',
          rewards: buildRewards(Number(target.payload.diamond ?? 0), target.payload.boxes ?? {}),
        });
      }
      router.refresh();
    });
  };

  const claimAll = () => {
    setError(null);
    // 서버 권위 합계가 있으면 사용, 없으면 표시된 항목 기반 폴백.
    const totalDiamondOptimistic =
      unreadAggregate?.diamond ??
      combinedBase.reduce((a, m) => a + Number(m.payload.diamond ?? 0), 0);
    startTransition(async () => {
      // 낙관: 모든 우편 즉시 제거 + 다이아 합계 가산.
      setOptimisticItems([]);
      if (totalDiamondOptimistic > 0) adjustDiamond(BigInt(totalDiamondOptimistic));
      const r = await claimAllMailAction();
      if (r.status === 'error') {
        if (totalDiamondOptimistic > 0) adjustDiamond(-BigInt(totalDiamondOptimistic));
        setError(r.message);
        showError(r.message);
        return;
      }
      // 성공 — 모두 받기 합계를 헤더 토스트로 노출(서버 권위 totals 기준).
      showHeaderToast({
        title: '우편 모두 받기',
        rewards: buildRewards(totals.diamond, totals.boxes),
      });
      router.refresh();
    });
  };

  const loadMore = () => {
    setError(null);
    if (combinedBase.length === 0) return;
    const oldest = combinedBase[combinedBase.length - 1];
    // skeleton 3개 즉시 노출(layout shift 최소화).
    setLoadingSkeletons(3);
    startTransition(async () => {
      const r = await loadMoreMailsAction(tab, oldest.createdAtIso);
      setLoadingSkeletons(0);
      if (r.status === 'error') {
        setError(r.message);
        showError(r.message);
        return;
      }
      setExtraItems((prev) => [...prev, ...r.items]);
      setHasMore(r.hasMore);
    });
  };

  const tabCls = (active: boolean) =>
    `flex-1 rounded-full px-3 py-1.5 text-xs font-semibold ${
      active
        ? 'bg-zinc-900 text-white dark:bg-zinc-50 dark:text-zinc-950'
        : 'text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-900'
    }`;

  return (
    <div className="space-y-3 px-4 py-4">
      <div className="flex gap-1 rounded-full bg-zinc-100 p-1 text-center dark:bg-zinc-900">
        <Link href="/mail" className={tabCls(tab === 'unread')}>
          미수령{unreadCount != null && unreadCount > 0 ? ` (${unreadCount})` : ''}
        </Link>
        <Link href="/mail?tab=done" className={tabCls(tab === 'done')}>
          수령 완료
        </Link>
      </div>

      {tab === 'unread' && totalCount > 0 ? (
        // 컴팩트 1행 — 좌 라벨 + 우 합계 preview. 즉시 실행(컨펌 없음).
        // 옵티미스틱: 클릭 시 displayItems가 즉시 [] → 버튼 자체가 사라짐.
        <button
          type="button"
          onClick={claimAll}
          className="flex w-full items-center justify-between gap-2 rounded-lg border border-amber-500/50 bg-amber-500/10 px-3 py-2.5 text-amber-700 hover:bg-amber-500/20 dark:text-amber-300"
        >
          <span className="text-xs font-bold">모두 받기 ({totalCount}건)</span>
          {totalParts.length > 0 ? (
            <span className="truncate font-mono text-[10px] tabular-nums opacity-85">
              {totalParts.join(' · ')}
            </span>
          ) : null}
        </button>
      ) : null}

      {error ? (
        <p className="rounded bg-red-50 px-2 py-1 text-[11px] text-red-700 dark:bg-red-950/60 dark:text-red-300">
          {error}
        </p>
      ) : null}

      {displayItems.length === 0 ? (
        <div className="rounded-lg border border-dashed border-zinc-300 px-4 py-10 text-center dark:border-zinc-700">
          <p className="text-xs text-zinc-500">
            {tab === 'unread' ? '미수령 우편이 없습니다.' : '수령 완료한 우편이 없습니다.'}
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {displayItems.map((m) => {
            const expMs = new Date(m.expiresAtIso).getTime();
            const expSoon = tab === 'unread' && expMs - nowMs < 24 * 3_600_000;
            const meta = TYPE_META[m.type] ?? DEFAULT_TYPE_META;
            const showPayload = hasPayload(m.payload);
            return (
              <li
                key={m.id}
                className="relative overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950"
              >
                {/* 좌측 컬러바 — type별 시각 anchor */}
                <span
                  className={`absolute left-0 top-0 h-full w-[3px] ${meta.bar}`}
                  aria-hidden
                />
                {/* 우측 배경 아바타(종류별) — 좌→우 그라데이션으로 텍스트 가독성 유지 */}
                {m.avatar ? (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={m.avatar}
                      alt=""
                      aria-hidden
                      draggable={false}
                      className="pointer-events-none absolute right-1 top-0 z-0 h-[150%] w-auto opacity-95"
                      style={{ imageRendering: 'pixelated' }}
                    />
                    <div
                      className="pointer-events-none absolute inset-0 z-0 bg-gradient-to-r from-white via-white/85 to-white/25 dark:from-zinc-950 dark:via-zinc-950/85 dark:to-zinc-950/25"
                      aria-hidden
                    />
                  </>
                ) : null}
                <div className="relative z-10 p-3 pl-3.5">
                  <div className="flex items-baseline justify-between gap-2">
                    <div className="min-w-0 flex-1">
{/* 메타 행 — 발신 출처 1종만 노출(2026-06-01 중복 정리).
    admin: senderLabel + 운영자 배지(타입 배지 생략).
    시스템 우편(reward 또는 profile_x 또는 notice): 타입 배지만(senderLabel 생략).
    그 외: 타입 배지 + senderLabel 폴백. */}
                      <div className="flex items-center gap-1.5 text-[10px] text-zinc-500">
                        {m.type === 'admin' ? (
                          <>
                            <span className="truncate font-semibold text-zinc-700 dark:text-zinc-300">
                              {m.senderLabel || '운영자'}
                            </span>
                            <VerifiedAdminBadge />
                          </>
                        ) : TYPE_META[m.type] ? (
                          <span
                            className={`rounded-full px-1.5 py-0 text-[9px] font-semibold ${meta.labelClass}`}
                          >
                            {meta.label}
                          </span>
                        ) : (
                          <>
                            <span
                              className={`rounded-full px-1.5 py-0 text-[9px] font-semibold ${meta.labelClass}`}
                            >
                              {meta.label}
                            </span>
                            <span className="truncate font-semibold text-zinc-700 dark:text-zinc-300">
                              {m.senderLabel}
                            </span>
                          </>
                        )}
                        <span>·</span>
                        <span className={expSoon ? 'text-red-600 dark:text-red-400' : ''}>
                          {tab === 'unread' ? fmtRemaining(expMs, nowMs) : '수령 완료'}
                        </span>
                      </div>
                      <div className="mt-0.5 text-sm font-semibold">{m.title}</div>
                      {m.body ? (
                        <p className="mt-1 whitespace-pre-wrap text-[11px] leading-relaxed text-zinc-600 dark:text-zinc-400">
                          {m.body}
                        </p>
                      ) : null}
                    </div>
                    {tab === 'unread' ? (
                      // disabled={pending} 제거(2026-06-02) — 옵티미스틱 제거로 더블클릭
                      // 자체가 불가능(이미 사라진 카드 클릭 X). 다른 카드는 자유롭게 수령.
                      <button
                        type="button"
                        onClick={() => claim(m.id)}
                        className="shrink-0 rounded-full bg-zinc-900 px-3 py-1.5 text-[11px] font-semibold text-white dark:bg-zinc-50 dark:text-zinc-950"
                      >
                        받기
                      </button>
                    ) : null}
                  </div>
                  {showPayload ? (
                    <div className="mt-2">
                      <PayloadChips payload={m.payload} />
                    </div>
                  ) : null}
                </div>
              </li>
            );
          })}
          {/* 더 보기 skeleton — 카드 슬롯을 즉시 점유해 layout shift 방지.
              pulse 애니메이션으로 로딩 상태 시각 표시. */}
          {Array.from({ length: loadingSkeletons }, (_, i) => (
            <li
              key={`sk-${i}`}
              className="relative overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950"
              aria-hidden
            >
              <span className="absolute left-0 top-0 h-full w-[3px] bg-zinc-300 dark:bg-zinc-700" />
              <div className="animate-pulse p-3 pl-3.5">
                <div className="h-2 w-20 rounded bg-zinc-200 dark:bg-zinc-800" />
                <div className="mt-2 h-3 w-3/4 rounded bg-zinc-200 dark:bg-zinc-800" />
                <div className="mt-2 h-2 w-full rounded bg-zinc-200/70 dark:bg-zinc-800/70" />
              </div>
            </li>
          ))}
        </ul>
      )}

      {displayItems.length > 0 && hasMore && loadingSkeletons === 0 ? (
        <button
          type="button"
          onClick={loadMore}
          className="w-full rounded-full border border-zinc-300 px-3 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
        >
          더 보기
        </button>
      ) : null}
    </div>
  );
}
