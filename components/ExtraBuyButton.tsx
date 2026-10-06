'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import { josa } from 'josa';

import { ModalShell } from '@/components/ModalShell';
import { ModalButton, ModalConfirmButton, ModalLayout } from '@/components/ModalLayout';
import { PlusChip } from '@/components/ui/PlusChip';
import { useResourceToast } from '@/components/ResourceToast';
import { MILEAGE_PER_MELEE_POINT, POINT_EXTRA_PRICES, pointExtraPrice, type PointExtraItem } from '@/lib/game/balance';
import type { PointKind } from '@/lib/game/points/types';
import { resyncWhenOnline } from '@/lib/client/resync';
import { kstDateString } from '@/lib/kst';

import { buyExtraAction, extraQuoteAction } from '@/app/(game)/shop/point-actions';

/** 파견 다시 보내기 — 팝업에서 고를 칸(오늘 다녀온 칸). */
export type ResendSlot = { slot: number; label: string };

const COPY: Record<PointExtraItem, { title: string; desc: string; done: string }> = {
  expedition: { title: '파견 다시 보내기', desc: '오늘 다녀온 슬롯에 새 파견지를 바로 받아요.', done: '새 파견지가 나왔어요' },
  raid: { title: '오늘 레이드 +1회', desc: '소환·참여를 한 번 더, 동시 진행도 하나 늘어요.', done: '오늘 레이드 +1회' },
  tower: { title: '탑 추가 도전', desc: '오늘 도전을 한 번 더 할 수 있어요. 오르기·토벌 모두 쓸 수 있어요.', done: '오늘 도전 +1회' },
};
const KIND_KO: Record<PointKind, string> = { melee: '대난투 포인트', mileage: '마일리지' };
const fmt = (n: number) => n.toLocaleString('ko-KR');
const amountIn = (kind: PointKind, pt: number) => (kind === 'mileage' ? pt * MILEAGE_PER_MELEE_POINT : pt);
/** 가격 표기 — 대난투 '5pt', 마일리지 '마일리지 50'(숫자만 두면 무엇의 50인지 모른다). */
const amountLabel = (kind: PointKind, pt: number) => (kind === 'melee' ? `${fmt(pt)}pt` : `마일리지 ${fmt(amountIn(kind, pt))}`);
/** 사기 버튼 — 마일리지 금액은 50·100·200…이라 조사를 josa로('200으로'). pt는 '포인트'로 읽혀 '로'. */
const buyLabel = (kind: PointKind, pt: number) => (kind === 'melee' ? `${fmt(pt)}pt로 사기` : josa(`${amountLabel(kind, pt)}#{으로} 사기`));
/** 자정 소멸 안내(사면 그날 안에 쓴다 — 보관·환불 없음, 10-06 확정). */
const EXPIRE: Record<PointExtraItem, string> = {
  expedition: '보내지 않은 추가 파견은 자정 초기화 때 소멸돼요',
  raid: '쓰지 않은 추가 횟수는 자정 초기화 때 소멸돼요',
  tower: '쓰지 않은 추가 도전은 자정 초기화 때 소멸돼요',
};

const ERR: Record<string, string> = {
  PRICE_CHANGED: '가격이 바뀌었어요. 다시 확인해 주세요',
  MAX_REACHED: '오늘은 더 살 수 없어요',
  // 파견만 — 보낼 수 있는 파견이 남아 있으면 다시 보내기를 사지 않는다(탑·레이드는 남아 있어도 살 수 있다).
  NOT_NEEDED: '지금 보낼 수 있는 파견이 있어요',
  SLOT_BUSY: '그 슬롯은 지금 다시 보낼 수 없어요',
  SLOT_LOCKED: '아직 열리지 않은 슬롯이에요',
  RATE_LIMITED: '요청이 너무 빠릅니다. 잠시 후 다시 시도해 주세요.',
  MAINTENANCE: '서버 점검 중입니다. 잠시 후 다시 시도해 주세요.',
  BANNED: '이용이 제한된 계정입니다.',
  NETWORK: '요청이 전송되지 않았어요. 연결을 확인해 주세요.',
};

type Quote = { melee: number; mileage: number; bought: number; max: number; price: number | null };

// 견적은 상품별로 화면 전체가 같이 쓴다 — 탑은 머리·층 상세·전투 결과에 ＋가 따로 그려지는데, 그때마다 서버 액션을
// 보내면 바로 뒤에 누른 도전·공격이 그 뒤에 줄을 선다(서버 액션은 한 번에 하나씩 나간다). 받은 지 얼마 안 된 값은 다시 받지 않는다.
const QUOTE_FRESH_MS = 30_000;
const sharedQuote: Partial<Record<PointExtraItem, { q: Quote; at: number }>> = {};
const quoteInflight: Partial<Record<PointExtraItem, ReturnType<typeof requestQuote>>> = {};
const requestQuote = (item: PointExtraItem) =>
  extraQuoteAction(item)
    .catch(() => ({ status: 'error', code: 'NETWORK' }) as const)
    .then((r) => {
      if (r.status === 'success') sharedQuote[item] = { q: r, at: Date.now() };
      return r;
    });
/** 같은 상품의 요청이 이미 나가 있으면 그 응답을 같이 기다린다. */
const fetchSharedQuote = (item: PointExtraItem) => {
  const going = quoteInflight[item];
  if (going) return going;
  const p = requestQuote(item).finally(() => {
    if (quoteInflight[item] === p) delete quoteInflight[item];
  });
  quoteInflight[item] = p;
  return p;
};
// 결과를 모르는 채 끝난 구매의 요청 키(응답 유실·서버 오류) — 서버에서는 이미 샀을 수 있어, 다음 구매가 같은 번째면
// 같은 키로 다시 보낸다(서버가 같은 구매로 알아보고 두 번 받지 않는다). 견적의 '오늘 산 횟수'가 달라졌으면 그 구매는
// 들어간 것이라 새 키를 쓴다. ＋가 화면마다 다시 그려져도 이어지게 상품별로 둔다.
const unsettledKey: Partial<Record<PointExtraItem, { key: string; bought: number; day: string }>> = {};
const newKey = () => crypto.randomUUID().replace(/-/g, '');
/** 결과를 알 수 없는 실패(응답이 끊겼거나 서버 오류) — 서버에서는 이미 샀을 수 있다. */
const uncertain = (code: string) => code === 'NETWORK' || code === 'UNKNOWN';

/**
 * 추가 횟수 ＋ 버튼 + 공용 구매 팝업(docs/POINT-SHOP.md §6, 10-06 확정 시안) — 파견·레이드·탑이 같이 쓴다.
 * ＋를 보일지는 호출부가 정한다(탑·레이드는 오늘 더 살 수 있는 동안 늘, 파견은 다시 보낼 칸이 있을 때).
 * 팝업은 한 번에 한 장만 사고, 이번 가격과 다음 구매 가격을 함께 보여 준다. 잔액이 모자란 통화는 흐리게만 하고 누르면 헤더 토스트(막지 않음).
 * 레이아웃 시프트 방지(10-06): ＋가 그려질 때 견적을 미리 받아 두고(prefetch) 팝업은 그 값으로 바로 연다(뒤에서 새로 고침).
 * 사기는 낙관적 — 재확인 직후 팝업을 닫고 onOptimistic으로 호출부가 횟수를 먼저 올린다. 실패하면 onRollback으로 되돌리고 토스트.
 * 성공 확정은 onBought(서버 재렌더가 같은 값을 가져온다).
 */
export function ExtraBuyButton({
  item,
  slots,
  onBought,
  onOptimistic,
  onRollback,
  className = '',
  size = 'md',
}: {
  item: PointExtraItem;
  /** 파견만 — 다시 보낼 수 있는 칸. 비면 ＋를 눌러도 안내만. */
  slots?: ResendSlot[];
  onBought?: () => void;
  /** 재확인 직후(서버 응답 전) — 호출부가 횟수·슬롯을 먼저 바꾼다. 파견은 고른 슬롯. */
  onOptimistic?: (slot: number | null) => void;
  /** 실패 시 onOptimistic을 되돌린다. */
  onRollback?: (slot: number | null) => void;
  className?: string;
  size?: 'md' | 'sm' | 'pill';
}) {
  const router = useRouter();
  const { showHeaderToast, showError } = useResourceToast();
  const [open, setOpen] = useState(false);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [kind, setKind] = useState<PointKind>('melee');
  const [slot, setSlot] = useState<number | null>(null);
  const [pending, start] = useTransition();
  // 연타·Enter 반복으로 재렌더 전에 두 번 사지 않게 — pending은 다시 그려진 뒤에야 걸린다.
  const busy = useRef(false);
  // 팝업이 열려 있는 동안만 견적 응답을 반영한다(닫은 뒤 늦게 온 답이 토스트를 띄우지 않게).
  const openRef = useRef(false);
  const copy = COPY[item];
  const fetchQuote = () => fetchSharedQuote(item);
  useEffect(() => {
    // ＋가 그려질 때 — 받아 둔 값이 없거나 오래됐을 때만 미리 받는다(팝업을 빈 칸 없이 바로 열기 위해).
    const have = sharedQuote[item];
    if (!have || Date.now() - have.at > QUOTE_FRESH_MS) void fetchSharedQuote(item);
  }, [item]);
  const pickKind = (q: Quote) =>
    setKind(q.price !== null && q.melee >= q.price ? 'melee' : q.price !== null && q.mileage >= amountIn('mileage', q.price) ? 'mileage' : 'melee');

  const close = () => {
    openRef.current = false;
    setOpen(false);
  };

  const openPopup = () => {
    if (item === 'expedition' && (!slots || slots.length === 0)) {
      showHeaderToast({ title: '다시 보낼 수 있는 슬롯이 없어요' });
      return;
    }
    const entry = sharedQuote[item];
    // 오래된 '오늘은 더 못 삼'은 믿지 않는다(자정이 지나 다시 살 수 있다) — 그때는 새로 받아 판단한다.
    const expired = !!entry && entry.q.price === null && Date.now() - entry.at > QUOTE_FRESH_MS;
    const c = entry && !expired ? entry.q : null;
    if (c && c.price === null) {
      showHeaderToast({ title: '오늘은 더 살 수 없어요' });
      return;
    }
    setQuote(c);
    if (c) pickKind(c); // 처음엔 살 수 있는 통화를 골라 둔다(대난투 포인트 우선)
    setSlot(slots?.[0]?.slot ?? null);
    setOpen(true);
    openRef.current = true;
    loadQuote(!c);
  };

  /** 새 견적 — 미리 받은 값이 있으면 조용히 갈아 끼우고(값이 같으면 화면 변화 없음), 없을 때만 오류로 닫는다. */
  const loadQuote = (firstLoad: boolean) => {
    void fetchQuote().then((r) => {
      if (!openRef.current) return;
      if (r.status !== 'success') {
        if (firstLoad) {
          close();
          showError(ERR[r.code] ?? '불러오지 못했어요');
        }
        return;
      }
      if (r.price === null) {
        close();
        showHeaderToast({ title: '오늘은 더 살 수 없어요' });
        return;
      }
      setQuote(r);
      if (firstLoad) pickKind(r);
    });
  };

  const balanceOf = (k: PointKind) => (quote ? (k === 'melee' ? quote.melee : quote.mileage) : 0);
  const enough = (k: PointKind) => !!quote?.price && balanceOf(k) >= amountIn(k, quote.price);

  const buy = () => {
    if (!quote?.price || pending || busy.current) return;
    if (!enough(kind)) {
      showError(`${KIND_KO[kind]}가 부족해요`);
      return;
    }
    busy.current = true;
    const expectedPrice = quote.price;
    const max = quote.max;
    const usedSlot = slot;
    const spent = amountIn(kind, expectedPrice);
    const before = sharedQuote[item];
    // 결과를 모르는 채 끝난 같은 번째 구매가 있으면 그 키로 다시 보낸다(이미 들어갔다면 서버가 한 번만 받는다).
    const prev = unsettledKey[item];
    const day = kstDateString(); // 어제 남은 키를 오늘 구매에 다시 쓰지 않게
    const key = prev && prev.bought === quote.bought && prev.day === day ? prev.key : newKey();
    const attempt = { key, bought: quote.bought, day };
    // 낙관적 — 팝업을 바로 닫고 호출부 횟수를 먼저 올린다. 다음에 열 견적도 미리 맞춰 둔다.
    close();
    onOptimistic?.(usedSlot);
    if (before) {
      const bought = before.q.bought + 1;
      sharedQuote[item] = {
        at: before.at,
        q: {
          ...before.q,
          bought,
          price: pointExtraPrice(item, bought),
          melee: kind === 'melee' ? before.q.melee - spent : before.q.melee,
          mileage: kind === 'mileage' ? before.q.mileage - spent : before.q.mileage,
        },
      };
    }
    start(async () => {
      const r = await buyExtraAction({ item, kind, slot: usedSlot ?? undefined, key, expectedPrice }).catch(
        () => ({ status: 'error', code: 'NETWORK' }) as const,
      );
      busy.current = false;
      if (r.status === 'success') {
        delete unsettledKey[item];
        onBought?.();
        showHeaderToast({
          title: copy.title,
          detail: item === 'expedition' ? `슬롯 ${r.slot} · ${copy.done}` : `오늘 ${r.bought}/${max}번 샀어요`,
        });
      } else {
        // 결과를 모르면 키를 남겨 두고(다시 누르면 같은 구매) 화면을 서버 값으로 다시 맞춘다 — 서버에서는 들어갔을 수 있다.
        if (uncertain(r.code)) unsettledKey[item] = attempt;
        else delete unsettledKey[item];
        if (before) sharedQuote[item] = before;
        else delete sharedQuote[item];
        onRollback?.(usedSlot);
        showError(r.code === 'INSUFFICIENT_POINTS' ? `${KIND_KO[kind]}가 부족해요` : (ERR[r.code] ?? '구매하지 못했어요'));
        if (uncertain(r.code)) resyncWhenOnline(() => router.refresh());
      }
      void fetchQuote(); // 서버 값으로 다시 맞춰 둔다
    });
  };

  const price = quote?.price ?? null;
  const next = quote && price !== null ? pointExtraPrice(item, quote.bought + 1) : null;

  return (
    <>
      <PlusChip label={`${copy.title} 사기`} onClick={openPopup} className={className} size={size} />
      {open ? (
        <ModalShell onClose={close} label={copy.title}>
          <ModalLayout
            title={copy.title}
            subtitle={copy.desc}
            footer={
              <>
                <ModalButton tone="ghost" onClick={close}>
                  닫기
                </ModalButton>
                {/* 3초 재확인(10-06) — 첫 탭은 무장, 3초 안에 다시 누르면 구매. 잔액이 모자라면 무장하지 않고 토스트. */}
                <ModalConfirmButton
                  // 통화·슬롯을 바꾸거나 가격이 새로 고쳐지면 3초 재확인을 처음부터(무장한 채 다른 값으로 사지 않게).
                  key={`${kind}-${slot ?? 0}-${price ?? 0}`}
                  onArm={() => {
                    if (!quote?.price || pending) return false;
                    if (!enough(kind)) {
                      showError(`${KIND_KO[kind]}가 부족해요`);
                      return false;
                    }
                  }}
                  onConfirm={buy}
                  disabled={!quote || pending}
                >
                  {!quote ? '불러오는 중' : pending ? '사는 중' : buyLabel(kind, price!)}
                </ModalConfirmButton>
              </>
            }
          >
            <div className="space-y-2.5 text-[13px]">
              {item === 'expedition' && slots ? (
                // 다시 보낼 슬롯 — 한 줄 칩(슬롯 번호 · 지역).
                <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="다시 보낼 슬롯">
                  {slots.map((s) => (
                    <button
                      key={s.slot}
                      type="button"
                      role="radio"
                      aria-checked={slot === s.slot}
                      onClick={() => setSlot(s.slot)}
                      className={`min-w-[30%] flex-1 rounded-lg border px-2 py-1.5 text-center text-[12px] font-bold break-keep transition ${
                        slot === s.slot
                          ? 'border-amber-500 bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300'
                          : 'border-zinc-200 text-zinc-600 dark:border-zinc-700 dark:text-zinc-300'
                      }`}
                    >
                      슬롯 {s.slot} <span className="font-medium opacity-70">· {s.label}</span>
                    </button>
                  ))}
                </div>
              ) : null}

              {/* 통화 두 칸 — 칸마다 그 통화로 낼 값(크게)과 보유(작게). 고른 칸이 곧 이번 가격. */}
              <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="결제 수단">
                {(['melee', 'mileage'] as const).map((k) => (
                  <button
                    key={k}
                    type="button"
                    role="radio"
                    aria-checked={kind === k}
                    onClick={() => setKind(k)}
                    className={`rounded-xl border px-3 py-2 text-left transition ${
                      kind === k ? 'border-amber-500 bg-amber-50 dark:bg-amber-950/50' : 'border-zinc-200 dark:border-zinc-700'
                    } ${quote && !enough(k) ? 'opacity-45' : ''}`}
                  >
                    <span className="flex items-baseline justify-between gap-1 text-[10.5px] text-zinc-500 dark:text-zinc-400">
                      <span className="font-semibold">{KIND_KO[k]}</span>
                      <span className="tabular-nums">보유 {quote ? fmt(balanceOf(k)) : '…'}</span>
                    </span>
                    <span
                      className={`mt-0.5 block text-[19px] font-extrabold leading-tight tabular-nums ${
                        kind === k ? 'text-amber-600 dark:text-amber-300' : 'text-zinc-800 dark:text-zinc-100'
                      }`}
                    >
                      {price !== null && quote ? (k === 'melee' ? `${fmt(price)}pt` : fmt(amountIn(k, price))) : '…'}
                    </span>
                  </button>
                ))}
              </div>

              {/* 오늘 몇 번째인지 · 다음 값 — 한 줄, 아래에 자정 소멸 안내. */}
              <p className="flex flex-wrap items-center justify-center gap-x-1.5 text-center text-[11px] text-zinc-500 dark:text-zinc-400">
                <span>
                  오늘{' '}
                  <b className="tabular-nums text-zinc-700 dark:text-zinc-200">
                    {(quote?.bought ?? 0) + 1}/{quote?.max ?? POINT_EXTRA_PRICES[item].length}
                  </b>
                  번째
                </span>
                <span aria-hidden>·</span>
                <span>
                  {next !== null ? (
                    <>
                      다음 <b className="tabular-nums text-zinc-700 dark:text-zinc-200">{amountLabel(kind, next)}</b>
                    </>
                  ) : (
                    '오늘 마지막'
                  )}
                </span>
              </p>
              <p className="-mt-1 text-center text-[11px] text-zinc-500 dark:text-zinc-400">{EXPIRE[item]}</p>
            </div>
          </ModalLayout>
        </ModalShell>
      ) : null}
    </>
  );
}
