'use client';

import { useEffect, useMemo, useOptimistic, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

import type { Slot } from '@/lib/db/schema/equipment';
import { useDiamond } from '@/components/DiamondContext';
import { useResourceToast } from '@/components/ResourceToast';
import {
  claimMailAction,
  claimAllMailAction,
  loadMoreMailsAction,
} from './actions';

export type MailItem = {
  id: string;
  type: string;
  title: string;
  body: string;
  senderLabel: string;
  payload: { diamond?: number | string; boxes?: Partial<Record<Slot, number>> };
  claimedAtIso: string | null;
  expiresAtIso: string;
  createdAtIso: string;
};

const SLOT_EMOJI: Record<Slot, string> = { weapon: '⚔️', armor: '🛡️', accessory: '💍' };
const SLOT_LABEL: Record<Slot, string> = { weapon: '무기', armor: '방어구', accessory: '장신구' };

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

export function MailList({
  items,
  tab,
  unreadCount,
  hasMore: initialHasMore,
}: {
  items: MailItem[];
  tab: 'unread' | 'done';
  unreadCount: number | null;
  hasMore: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [extraItems, setExtraItems] = useState<MailItem[]>([]);
  const [hasMore, setHasMore] = useState(initialHasMore);
  // items prop이 바뀌면(claim 후 router.refresh) extras·hasMore 리셋 — 중복 방지.
  useEffect(() => {
    setExtraItems([]);
    setHasMore(initialHasMore);
  }, [items, initialHasMore]);

  const combinedBase = useMemo(() => [...items, ...extraItems], [items, extraItems]);
  const [displayItems, setOptimisticItems] = useOptimistic(combinedBase);
  const { optimisticAdjust: adjustDiamond } = useDiamond();
  const { showResource, showError } = useResourceToast();
  const nowMs = Date.now();

  // 모두 받기 합계 preview — 현재 표시된 미수령 우편 기준(서버는 모든 미수령 처리).
  // 표시 외 우편이 있을 수 있어 'N건 +' suffix(extras 로드 안 됨 + hasMore=true 시).
  const totals = useMemo(() => {
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
  }, [displayItems]);

  const totalParts = useMemo(() => {
    const parts: string[] = [];
    if (totals.diamond > 0) parts.push(`💎 +${totals.diamond.toLocaleString('ko-KR')}`);
    for (const s of ['weapon', 'armor', 'accessory'] as Slot[]) {
      const n = totals.boxes[s];
      if (n > 0) parts.push(`${SLOT_EMOJI[s]} +${n}`);
    }
    return parts;
  }, [totals]);

  const emitClaimToasts = (result: { diamond: number; boxes: Record<Slot, number> }) => {
    if (result.diamond > 0) showResource('💎', '다이아', result.diamond);
    for (const s of ['weapon', 'armor', 'accessory'] as Slot[]) {
      const n = result.boxes[s];
      if (n > 0) showResource(SLOT_EMOJI[s], `${SLOT_LABEL[s]} 보급권`, n);
    }
  };

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
      emitClaimToasts(r.result);
      router.refresh();
    });
  };

  const claimAll = () => {
    setError(null);
    const totalDiamondOptimistic = combinedBase.reduce(
      (a, m) => a + Number(m.payload.diamond ?? 0),
      0,
    );
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
      emitClaimToasts(r.result);
      router.refresh();
    });
  };

  const loadMore = () => {
    setError(null);
    if (combinedBase.length === 0) return;
    const oldest = combinedBase[combinedBase.length - 1];
    startTransition(async () => {
      const r = await loadMoreMailsAction(tab, oldest.createdAtIso);
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
          받은
        </Link>
      </div>

      {tab === 'unread' && displayItems.length > 0 ? (
        <button
          type="button"
          disabled={pending}
          onClick={claimAll}
          className="flex w-full flex-col items-center justify-center gap-0.5 rounded-full bg-amber-500 px-3 py-2.5 text-amber-950 disabled:opacity-40"
        >
          <span className="text-sm font-bold">
            {pending ? '수령 중…' : `${displayItems.length}건 모두 받기`}
          </span>
          {!pending && totalParts.length > 0 ? (
            <span className="font-mono text-[11px] tabular-nums text-amber-900/80">
              {totalParts.join(' · ')}
              {hasMore ? ' · 외 더 있음' : ''}
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
            {tab === 'unread' ? '받지 않은 우편이 없습니다.' : '받은 우편이 없습니다.'}
          </p>
          {tab === 'unread' ? (
            <Link
              href="/checkin"
              className="mt-3 inline-block rounded-full bg-zinc-900 px-3 py-1.5 text-[11px] font-semibold text-white dark:bg-zinc-50 dark:text-zinc-950"
            >
              출석 체크하러 가기
            </Link>
          ) : null}
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
                <div className="p-3 pl-3.5">
                  <div className="flex items-baseline justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 text-[10px] text-zinc-500">
                        <span
                          className={`rounded-full px-1.5 py-0 text-[9px] font-semibold ${meta.labelClass}`}
                        >
                          {meta.label}
                        </span>
                        <span className="truncate font-semibold text-zinc-700 dark:text-zinc-300">
                          {m.senderLabel}
                        </span>
                        {m.type === 'admin' ? <VerifiedAdminBadge /> : null}
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
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => claim(m.id)}
                        className="shrink-0 rounded-full bg-zinc-900 px-3 py-1.5 text-[11px] font-semibold text-white disabled:opacity-40 dark:bg-zinc-50 dark:text-zinc-950"
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
        </ul>
      )}

      {displayItems.length > 0 && hasMore ? (
        <button
          type="button"
          disabled={pending}
          onClick={loadMore}
          className="w-full rounded-full border border-zinc-300 px-3 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
        >
          {pending ? '불러오는 중…' : '더 보기'}
        </button>
      ) : null}
    </div>
  );
}
