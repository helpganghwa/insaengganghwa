'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import type { Slot } from '@/lib/db/schema/equipment';
import {
  claimAllMailAction,
  claimMailAction,
  getUnreadMailsAction,
} from '@/app/(game)/mail/actions';
import type { MailItem } from '@/app/(game)/mail/MailList';

const SLOT_EMOJI: Record<Slot, string> = { weapon: '⚔️', armor: '🛡️', accessory: '💍' };

function fmtRemaining(targetMs: number, nowMs: number): string {
  const diff = targetMs - nowMs;
  if (diff <= 0) return '만료';
  const h = Math.floor(diff / 3_600_000);
  if (h < 24) return `${h}시간 남음`;
  const d = Math.floor(h / 24);
  return `${d}일 남음`;
}

/** 모달 본문 로딩용 — 카드 골격과 동일 높이로 placeholder 노출(layout shift 0). */
function MailSkeleton({ count }: { count: number }) {
  const n = Math.min(5, Math.max(1, count));
  return (
    <ul className="space-y-1.5" aria-live="polite" aria-busy="true">
      {Array.from({ length: n }).map((_, i) => (
        <li
          key={i}
          className="animate-pulse rounded-lg border border-zinc-200 p-2.5 dark:border-zinc-800"
        >
          <div className="flex items-baseline justify-between gap-2">
            <div className="min-w-0 flex-1 space-y-1.5">
              <div className="h-2.5 w-24 rounded bg-zinc-200 dark:bg-zinc-800" />
              <div className="h-3.5 w-3/4 rounded bg-zinc-200 dark:bg-zinc-800" />
              <div className="h-2.5 w-2/3 rounded bg-zinc-200 dark:bg-zinc-800" />
            </div>
            <div className="h-7 w-12 shrink-0 rounded-full bg-zinc-200 dark:bg-zinc-800" />
          </div>
          <div className="mt-2 flex gap-1.5">
            <div className="h-4 w-14 rounded bg-zinc-200 dark:bg-zinc-800" />
            <div className="h-4 w-10 rounded bg-zinc-200 dark:bg-zinc-800" />
          </div>
        </li>
      ))}
    </ul>
  );
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

/**
 * 헤더 ✉️ 버튼 + 팝업. 상세 페이지(/mail)로 이동하지 않고 모달로 조회/수령.
 *
 * 데이터 로딩 전략(layout shift 방지):
 *  1) 컴포넌트 마운트 시 미수령 배지가 있으면 **백그라운드 prefetch** — 사용자가
 *     열기 전에 items 준비. 열어도 즉시 본문 렌더.
 *  2) 버튼 hover/focus(데스크탑·일부 모바일)에서도 prefetch.
 *  3) 모달 본문은 **min-h-[280px]** 고정 + 로딩 중엔 스켈레톤(같은 카드 골격).
 *     items가 이미 있으면 fetch 중에도 그대로 노출(silent refresh).
 *  4) claim 후 router.refresh로 SSR mailBadge 갱신.
 */
export function MailButton({ mailBadge }: { mailBadge: string | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<MailItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [loading, setLoading] = useState(false);

  // 첫 mount + 배지 변화 시 prefetch — 미수령 1건 이상일 때만.
  // (배지 null이면 빈 우편함이라 미리 받아도 표시 변화 없음 → 트래픽 절약)
  const hasBadge = !!mailBadge;
  useEffect(() => {
    if (!hasBadge) return;
    if (items != null) return; // 이미 보유
    setLoading(true);
    setError(null);
    getUnreadMailsAction()
      .then((rows) => setItems(rows))
      .catch(() => setError('우편 조회에 실패했습니다.'))
      .finally(() => setLoading(false));
  }, [hasBadge, items]);

  // 모달 열 때도 보장(혹시 prefetch 안 됐거나 stale인 경우).
  useEffect(() => {
    if (!open) return;
    if (items != null) return; // 이미 있으면 skip — silent refresh는 refresh() 사용
    setLoading(true);
    setError(null);
    getUnreadMailsAction()
      .then((rows) => setItems(rows))
      .catch(() => setError('우편 조회에 실패했습니다.'))
      .finally(() => setLoading(false));
  }, [open, items]);

  const prefetchOnHover = () => {
    if (items != null || loading) return;
    setLoading(true);
    getUnreadMailsAction()
      .then((rows) => setItems(rows))
      .catch(() => {
        /* hover 실패는 silent — 열 때 재시도 */
      })
      .finally(() => setLoading(false));
  };

  // claim 후 silent refresh — items는 즉시 갱신, layout 흔들림 없음.
  const refresh = async () => {
    try {
      const rows = await getUnreadMailsAction();
      setItems(rows);
    } catch {
      /* 무시: 다음 액션에서 다시 시도 */
    }
  };

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const claim = (id: string) => {
    setError(null);
    startTransition(async () => {
      const r = await claimMailAction(id);
      if (r.status === 'error') {
        setError(r.message);
        return;
      }
      const { diamond, boxes } = r.result;
      const parts: string[] = [];
      if (diamond > 0) parts.push(`💎 +${diamond.toLocaleString('ko-KR')}`);
      for (const s of ['weapon', 'armor', 'accessory'] as Slot[]) {
        if (boxes[s] > 0) parts.push(`${SLOT_EMOJI[s]} +${boxes[s]}`);
      }
      showToast(parts.length ? `수령: ${parts.join(' · ')}` : '수령 완료');
      await refresh();
      router.refresh();
    });
  };

  const claimAll = () => {
    setError(null);
    startTransition(async () => {
      const r = await claimAllMailAction();
      if (r.status === 'error') {
        setError(r.message);
        return;
      }
      const { diamond, boxes } = r.result;
      const parts: string[] = [];
      if (diamond > 0) parts.push(`💎 +${diamond.toLocaleString('ko-KR')}`);
      for (const s of ['weapon', 'armor', 'accessory'] as Slot[]) {
        if (boxes[s] > 0) parts.push(`${SLOT_EMOJI[s]} +${boxes[s]}`);
      }
      showToast(parts.length ? `일괄 수령: ${parts.join(' · ')}` : '받을 우편이 없습니다');
      await refresh();
      router.refresh();
    });
  };

  const nowMs = Date.now();

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        onMouseEnter={prefetchOnHover}
        onFocus={prefetchOnHover}
        onTouchStart={prefetchOnHover}
        aria-label={`우편함${mailBadge ? ` 미수령 ${mailBadge}` : ''}`}
        className="relative inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2 py-0.5 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
      >
        <span aria-hidden>✉️</span>
        {mailBadge ? (
          <span className="absolute -right-1 -top-1 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white">
            {mailBadge}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="우편함"
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="flex max-h-[82dvh] w-full max-w-xs flex-col overflow-hidden rounded-2xl bg-white dark:bg-zinc-950"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="flex items-center justify-between border-b border-zinc-100 px-4 py-3 dark:border-zinc-900">
              <h2 className="text-sm font-semibold">
                ✉️ 우편함
                {items != null ? (
                  <span className="ml-1 text-xs font-normal text-zinc-500">({items.length})</span>
                ) : null}
              </h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-base leading-none text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300"
                aria-label="닫기"
              >
                ×
              </button>
            </header>

            <div className="min-h-[280px] flex-1 overflow-y-auto px-3 py-3">
              {error ? (
                <p className="mb-2 rounded bg-red-50 px-2 py-1 text-[11px] text-red-700 dark:bg-red-950/60 dark:text-red-300">
                  {error}
                </p>
              ) : null}
              {loading && items == null ? (
                <MailSkeleton count={Number(mailBadge ?? 2) || 2} />
              ) : items != null && items.length === 0 ? (
                <p className="rounded-lg border border-dashed border-zinc-300 p-8 text-center text-xs text-zinc-500 dark:border-zinc-700">
                  받지 않은 우편이 없습니다.
                </p>
              ) : items != null ? (
                <ul className="space-y-1.5">
                  {items.map((m) => {
                    const expMs = new Date(m.expiresAtIso).getTime();
                    const expSoon = expMs - nowMs < 24 * 3_600_000;
                    return (
                      <li
                        key={m.id}
                        className="rounded-lg border border-zinc-200 p-2.5 dark:border-zinc-800"
                      >
                        <div className="flex items-baseline justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1 text-[10px] text-zinc-500">
                              <span>{m.senderLabel}</span>
                              <span>·</span>
                              <span
                                className={
                                  expSoon ? 'text-red-600 dark:text-red-400' : 'text-zinc-500'
                                }
                              >
                                {fmtRemaining(expMs, nowMs)}
                              </span>
                            </div>
                            <div className="mt-0.5 truncate text-sm font-semibold">{m.title}</div>
                            {m.body ? (
                              <p className="mt-1 line-clamp-2 text-[11px] text-zinc-600 dark:text-zinc-400">
                                {m.body}
                              </p>
                            ) : null}
                          </div>
                          <button
                            type="button"
                            disabled={pending}
                            onClick={() => claim(m.id)}
                            className="shrink-0 rounded-full bg-zinc-900 px-3 py-1.5 text-[11px] font-semibold text-white disabled:opacity-40 dark:bg-zinc-50 dark:text-zinc-950"
                          >
                            받기
                          </button>
                        </div>
                        <div className="mt-1.5">
                          <PayloadChips payload={m.payload} />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              ) : null}
            </div>

            {items != null && items.length > 0 ? (
              <div className="border-t border-zinc-100 px-3 py-3 dark:border-zinc-900">
                <button
                  type="button"
                  disabled={pending}
                  onClick={claimAll}
                  className="w-full rounded-full bg-amber-500 px-3 py-2.5 text-sm font-bold text-amber-950 disabled:opacity-40"
                >
                  {pending ? '수령 중…' : `${items.length}건 모두 받기`}
                </button>
              </div>
            ) : null}
          </div>

          {toast ? (
            <div className="pointer-events-none fixed inset-x-0 bottom-20 z-50 flex justify-center px-4">
              <div className="rounded-full bg-zinc-900 px-4 py-2 text-xs font-semibold text-white shadow-lg dark:bg-zinc-50 dark:text-zinc-950">
                {toast}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
