'use client';

import { useState, useTransition } from 'react';

import { ModalShell } from '@/components/ModalShell';
import { ModalButton, ModalLayout } from '@/components/ModalLayout';
import { useResourceToast } from '@/components/ResourceToast';
import { MILEAGE_PER_MELEE_POINT, POINT_EXTRA_PRICES, pointExtraPrice, type PointExtraItem } from '@/lib/game/balance';
import type { PointKind } from '@/lib/game/points/types';

import { buyExtraAction, extraQuoteAction } from '@/app/(game)/shop/point-actions';

/** 파견 다시 보내기 — 팝업에서 고를 칸(오늘 다녀온 칸). */
export type ResendSlot = { slot: number; label: string };

const COPY: Record<PointExtraItem, { title: string; desc: string; done: string }> = {
  expedition: { title: '파견 다시 보내기', desc: '오늘 다녀온 칸을 한 번 더 보내요. 사면 그 칸에 새 파견지가 바로 나와요.', done: '새 파견지가 나왔어요' },
  raid: { title: '오늘 레이드 +1회', desc: '오늘 레이드(소환·참여)를 한 번 더 할 수 있어요. 동시에 진행할 수 있는 레이드도 하나 늘어나요.', done: '오늘 레이드 +1회' },
  tower: { title: '탑 추가 도전', desc: '오늘 도전을 한 번 더 할 수 있어요. 오르기·토벌 어디에나 쓸 수 있어요.', done: '오늘 도전 +1회' },
};
const KIND_KO: Record<PointKind, string> = { melee: '대난투 포인트', mileage: '마일리지' };
const fmt = (n: number) => n.toLocaleString('ko-KR');
const amountIn = (kind: PointKind, pt: number) => (kind === 'mileage' ? pt * MILEAGE_PER_MELEE_POINT : pt);
const amountLabel = (kind: PointKind, pt: number) => (kind === 'melee' ? `${fmt(pt)}pt` : fmt(amountIn(kind, pt)));

const ERR: Record<string, string> = {
  INSUFFICIENT_POINTS: '포인트가 부족해요',
  MAX_REACHED: '오늘은 더 살 수 없어요',
  NOT_NEEDED: '아직 남은 횟수가 있어요',
  SLOT_BUSY: '그 칸은 지금 다시 보낼 수 없어요',
  SLOT_LOCKED: '아직 열리지 않은 칸이에요',
  RATE_LIMITED: '요청이 너무 빠릅니다. 잠시 후 다시 시도해 주세요.',
  MAINTENANCE: '서버 점검 중입니다. 잠시 후 다시 시도해 주세요.',
  BANNED: '이용이 제한된 계정입니다.',
  NETWORK: '요청이 전송되지 않았어요. 연결을 확인해 주세요.',
};

type Quote = { melee: number; mileage: number; bought: number; max: number; price: number | null };

/**
 * 추가 횟수 ＋ 버튼 + 공용 구매 팝업(docs/POINT-SHOP.md §6, 10-06 확정 시안) — 파견·레이드·탑이 같이 쓴다.
 * ＋를 보일지는 호출부가 정한다(기본 횟수를 다 썼을 때만). 팝업은 한 번에 한 장만 사고, 이번 가격과
 * 다음 구매 가격을 함께 보여 준다. 잔액이 모자란 통화는 흐리게만 하고 누르면 헤더 토스트(막지 않음).
 * 사면 서버 액션의 현재 경로 재렌더로 횟수가 바뀐다 — 호출부는 onBought로 낙관 표시만 맞추면 된다.
 */
export function ExtraBuyButton({
  item,
  slots,
  onBought,
  className = '',
}: {
  item: PointExtraItem;
  /** 파견만 — 다시 보낼 수 있는 칸. 비면 ＋를 눌러도 안내만. */
  slots?: ResendSlot[];
  onBought?: () => void;
  className?: string;
}) {
  const { showHeaderToast, showError } = useResourceToast();
  const [open, setOpen] = useState(false);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [kind, setKind] = useState<PointKind>('melee');
  const [slot, setSlot] = useState<number | null>(null);
  const [pending, start] = useTransition();
  const copy = COPY[item];

  const openPopup = () => {
    if (item === 'expedition' && (!slots || slots.length === 0)) {
      showHeaderToast({ title: '다시 보낼 수 있는 칸이 없어요' });
      return;
    }
    setQuote(null);
    setSlot(slots?.[0]?.slot ?? null);
    setOpen(true);
    void extraQuoteAction(item)
      .catch(() => ({ status: 'error', code: 'NETWORK' }) as const)
      .then((r) => {
        if (r.status !== 'success') {
          setOpen(false);
          showError(ERR[r.code] ?? '불러오지 못했어요');
          return;
        }
        if (r.price === null) {
          setOpen(false);
          showHeaderToast({ title: '오늘은 더 살 수 없어요' });
          return;
        }
        setQuote(r);
        // 처음엔 살 수 있는 통화를 골라 둔다(대난투 포인트 우선).
        setKind(r.melee >= r.price ? 'melee' : r.mileage >= amountIn('mileage', r.price) ? 'mileage' : 'melee');
      });
  };

  const balanceOf = (k: PointKind) => (quote ? (k === 'melee' ? quote.melee : quote.mileage) : 0);
  const enough = (k: PointKind) => !!quote?.price && balanceOf(k) >= amountIn(k, quote.price);

  const buy = () => {
    if (!quote?.price || pending) return;
    if (!enough(kind)) {
      showError(`${KIND_KO[kind]}가 부족해요`);
      return;
    }
    const key = crypto.randomUUID().replace(/-/g, '');
    start(async () => {
      const r = await buyExtraAction({ item, kind, slot: slot ?? undefined, key }).catch(
        () => ({ status: 'error', code: 'NETWORK' }) as const,
      );
      if (r.status === 'success') {
        setOpen(false);
        onBought?.();
        showHeaderToast({
          title: copy.title,
          detail: item === 'expedition' ? `${r.slot}칸 · ${copy.done}` : `오늘 ${r.bought}/${quote.max}번 샀어요`,
        });
      } else {
        showError(ERR[r.code] ?? '구매하지 못했어요');
        if (r.code === 'MAX_REACHED' || r.code === 'NOT_NEEDED') setOpen(false);
      }
    });
  };

  const price = quote?.price ?? null;
  const next = quote && price !== null ? pointExtraPrice(item, quote.bought + 1) : null;

  return (
    <>
      <button
        type="button"
        aria-label={`${copy.title} 사기`}
        onClick={openPopup}
        className={`inline-flex h-[22px] w-[22px] items-center justify-center rounded-[7px] border border-amber-500/70 bg-amber-50 text-[15px] font-black leading-none text-amber-600 transition active:scale-95 dark:bg-amber-950/60 dark:text-amber-300 ${className}`}
      >
        ＋
      </button>
      {open ? (
        <ModalShell onClose={() => setOpen(false)} onSubmit={buy} label={copy.title}>
          <ModalLayout
            title={copy.title}
            subtitle={copy.desc}
            footer={
              <>
                <ModalButton tone="ghost" onClick={() => setOpen(false)}>
                  닫기
                </ModalButton>
                <ModalButton tone="primary" grow={2} onClick={buy} disabled={!quote || pending}>
                  {!quote
                    ? '불러오는 중'
                    : pending
                      ? '사는 중'
                      : item === 'expedition'
                        ? `${slot}칸 다시 보내기 · ${amountLabel(kind, price!)}`
                        : `${kind === 'melee' ? '' : '마일리지 '}${amountLabel(kind, price!)}로 사기`}
                </ModalButton>
              </>
            }
          >
            <div className="space-y-3 text-[13px]">
              {item === 'expedition' && slots ? (
                <div>
                  <p className="mb-1 text-[11px] font-bold text-zinc-500 dark:text-zinc-400">다시 보낼 칸</p>
                  <div className="flex flex-wrap gap-1.5">
                    {slots.map((s) => (
                      <button
                        key={s.slot}
                        type="button"
                        aria-pressed={slot === s.slot}
                        onClick={() => setSlot(s.slot)}
                        className={`min-w-[30%] flex-1 rounded-lg border px-2 py-1.5 text-center text-[12px] font-bold transition ${
                          slot === s.slot
                            ? 'border-amber-500 bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300'
                            : 'border-zinc-200 text-zinc-700 dark:border-zinc-700 dark:text-zinc-200'
                        }`}
                      >
                        {s.slot}칸
                        <span className="block text-[10px] font-medium text-zinc-500 dark:text-zinc-400">{s.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="flex items-end justify-between rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2.5 dark:border-zinc-700 dark:bg-zinc-800/60">
                <div>
                  <p className="text-[10.5px] font-semibold text-zinc-500 dark:text-zinc-400">이번 가격</p>
                  <p className="text-[22px] font-extrabold tabular-nums text-amber-600 dark:text-amber-300">
                    {quote && price !== null ? amountLabel(kind, price) : '—'}
                  </p>
                </div>
                <p className="text-right text-[11px] leading-[1.5] text-zinc-500 dark:text-zinc-400">
                  오늘{' '}
                  <b className="tabular-nums text-zinc-800 dark:text-zinc-100">
                    {quote?.bought ?? 0}/{quote?.max ?? POINT_EXTRA_PRICES[item].length}
                  </b>
                  번 샀어요
                  <br />
                  {next !== null ? (
                    <>
                      다음 구매 <b className="tabular-nums text-zinc-800 dark:text-zinc-100">{amountLabel(kind, next)}</b>
                    </>
                  ) : (
                    '오늘 마지막 구매'
                  )}
                </p>
              </div>

              <div>
                <p className="mb-1 text-[11px] font-bold text-zinc-500 dark:text-zinc-400">무엇으로 살까요</p>
                <div className="grid grid-cols-2 gap-2">
                  {(['melee', 'mileage'] as const).map((k) => (
                    <button
                      key={k}
                      type="button"
                      aria-pressed={kind === k}
                      onClick={() => setKind(k)}
                      className={`rounded-xl border px-3 py-2 text-left transition ${
                        kind === k
                          ? 'border-amber-500 bg-amber-50 dark:bg-amber-950/50'
                          : 'border-zinc-200 dark:border-zinc-700'
                      } ${quote && !enough(k) ? 'opacity-50' : ''}`}
                    >
                      <span className="block text-[10px] text-zinc-500 dark:text-zinc-400">
                        {KIND_KO[k]} · 보유 {quote ? fmt(balanceOf(k)) : '—'}
                      </span>
                      <span className="text-[15px] font-extrabold tabular-nums text-zinc-900 dark:text-zinc-50">
                        {price !== null && quote ? amountLabel(k, price) : '—'}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
              {item === 'tower' ? (
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400">산 도전은 오늘 0시에 사라져요.</p>
              ) : null}
            </div>
          </ModalLayout>
        </ModalShell>
      ) : null}
    </>
  );
}
