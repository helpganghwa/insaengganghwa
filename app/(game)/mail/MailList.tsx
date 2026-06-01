'use client';

import { useOptimistic, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

import type { Slot } from '@/lib/db/schema/equipment';
import { useDiamond } from '@/components/DiamondContext';
import { claimMailAction, claimAllMailAction } from './actions';

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

function fmtRemaining(targetMs: number, nowMs: number): string {
  const diff = targetMs - nowMs;
  if (diff <= 0) return '만료';
  const h = Math.floor(diff / 3_600_000);
  if (h < 24) return `${h}시간 남음`;
  const d = Math.floor(h / 24);
  return `${d}일 남음`;
}

function PayloadChips({ payload }: { payload: MailItem['payload'] }) {
  const dia = Number(payload.diamond ?? 0);
  const boxes = payload.boxes ?? {};
  return (
    <div className="flex flex-wrap gap-1.5 text-[11px] font-mono tabular-nums">
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

export function MailList({
  items,
  tab,
  unreadCount,
}: {
  items: MailItem[];
  tab: 'unread' | 'done';
  unreadCount: number | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [displayItems, setOptimisticItems] = useOptimistic(items);
  const { optimisticAdjust: adjustDiamond } = useDiamond();
  const nowMs = Date.now();

  const claim = (id: string) => {
    setError(null);
    const target = items.find((m) => m.id === id);
    startTransition(async () => {
      // 낙관: 우편 즉시 제거 + 헤더 다이아 즉시 가산.
      if (target) {
        setOptimisticItems(displayItems.filter((m) => m.id !== id));
        const dia = Number(target.payload.diamond ?? 0);
        if (dia > 0) adjustDiamond(BigInt(dia));
      }
      const r = await claimMailAction(id);
      if (r.status === 'error') {
        // 롤백 — 서버 분배 정확값으로 재계산은 router.refresh로 자연 복귀.
        if (target) {
          const dia = Number(target.payload.diamond ?? 0);
          if (dia > 0) adjustDiamond(-BigInt(dia));
        }
        setError(r.message);
        return;
      }
      const { diamond, boxes } = r.result;
      const parts: string[] = [];
      if (diamond > 0) parts.push(`💎 +${diamond.toLocaleString('ko-KR')}`);
      for (const s of ['weapon', 'armor', 'accessory'] as Slot[]) {
        if (boxes[s] > 0) parts.push(`${SLOT_EMOJI[s]} +${boxes[s]}`);
      }
      setToast(parts.length ? `수령: ${parts.join(' · ')}` : '수령 완료');
      setTimeout(() => setToast(null), 3000);
      router.refresh();
    });
  };

  const claimAll = () => {
    setError(null);
    const totalDiamondOptimistic = items.reduce(
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
        return;
      }
      const { diamond, boxes } = r.result;
      const parts: string[] = [];
      if (diamond > 0) parts.push(`💎 +${diamond.toLocaleString('ko-KR')}`);
      for (const s of ['weapon', 'armor', 'accessory'] as Slot[]) {
        if (boxes[s] > 0) parts.push(`${SLOT_EMOJI[s]} +${boxes[s]}`);
      }
      setToast(parts.length ? `일괄 수령: ${parts.join(' · ')}` : '받을 우편이 없습니다');
      setTimeout(() => setToast(null), 3500);
      router.refresh();
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
          className="w-full rounded-full bg-amber-500 px-3 py-2.5 text-sm font-bold text-amber-950 disabled:opacity-40"
        >
          {pending ? '수령 중…' : `📬 ${displayItems.length}건 모두 받기`}
        </button>
      ) : null}

      {error ? (
        <p className="rounded bg-red-50 px-2 py-1 text-[11px] text-red-700 dark:bg-red-950/60 dark:text-red-300">
          {error}
        </p>
      ) : null}

      {displayItems.length === 0 ? (
        <p className="rounded-lg border border-dashed border-zinc-300 p-10 text-center text-xs text-zinc-500 dark:border-zinc-700">
          {tab === 'unread' ? '받지 않은 우편이 없습니다.' : '받은 우편이 없습니다.'}
        </p>
      ) : (
        <ul className="space-y-2">
          {displayItems.map((m) => {
            const expMs = new Date(m.expiresAtIso).getTime();
            const expSoon = tab === 'unread' && expMs - nowMs < 24 * 3_600_000;
            return (
              <li
                key={m.id}
                className="rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 text-[10px] text-zinc-500">
                      <span className="font-semibold text-zinc-700 dark:text-zinc-300">
                        {m.senderLabel}
                      </span>
                      <span>·</span>
                      <span className={expSoon ? 'text-red-600 dark:text-red-400' : ''}>
                        {tab === 'unread' ? fmtRemaining(expMs, nowMs) : '수령 완료'}
                      </span>
                    </div>
                    <div className="mt-0.5 truncate text-sm font-semibold">{m.title}</div>
                    {m.body ? (
                      <p className="mt-1 line-clamp-2 text-[11px] text-zinc-600 dark:text-zinc-400">
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
                <div className="mt-2">
                  <PayloadChips payload={m.payload} />
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {toast ? (
        <div className="fixed inset-x-0 bottom-20 z-40 flex justify-center px-4">
          <div className="rounded-full bg-zinc-900 px-4 py-2 text-xs font-semibold text-white shadow-lg dark:bg-zinc-50 dark:text-zinc-950">
            {toast}
          </div>
        </div>
      ) : null}
    </div>
  );
}
