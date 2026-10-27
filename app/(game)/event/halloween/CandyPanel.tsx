'use client';

import { useMemo, useState, useTransition } from 'react';

import { useDiamondActions } from '@/components/DiamondContext';
import { ModalShell } from '@/components/ModalShell';
import { ModalButton, ModalLayout } from '@/components/ModalLayout';
import { useResourceToast } from '@/components/ResourceToast';
import { TitleTag } from '@/components/TitleTag';
import {
  CANDY_EXCHANGE,
  HALLOWEEN_ACCRUE_END_LABEL,
  HALLOWEEN_CLAIM_END_DAY,
  CANDY_EXCHANGE_MAX_PER_ACTION,
  CANDY_LADDER,
  nextCandyStep,
  type CandyExchangeKind,
} from '@/lib/game/halloween/config';
import type { CandyItemState, CandyOverview } from '@/lib/game/halloween/candy';
import { CANDY_ITEM_EXCHANGE, allowedItemCopies, simulateItemCopies } from '@/lib/game/halloween/item-exchange';
import { spritePath } from '@/lib/game/equipment/sprite-manifest';

import { assetUrl } from '@/lib/asset-versions';

import { claimCandyStepAction, exchangeCandyAction, exchangeCandyItemAction } from './actions';

const n = (v: number) => v.toLocaleString('ko-KR');

function CandyIcon({ size = 16 }: { size?: number }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={assetUrl('/sprites/halloween/candy.png')}
      alt=""
      aria-hidden
      width={size}
      height={size}
      draggable={false}
      className="inline-block shrink-0 align-[-0.15em]"
      style={{ imageRendering: 'pixelated' }}
    />
  );
}

function ItemImg({ code, size }: { code: string; size: number }) {
  const src = spritePath(code);
  if (!src) return <span style={{ width: size, height: size }} className="grid place-items-center text-lg">🎁</span>;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={assetUrl(src)} alt="" aria-hidden width={size} height={size} draggable={false} className="flex-none" style={{ imageRendering: 'pixelated' }} />;
}

/** 초월 상태 한 줄 — 미보유 / T{n} · 진행 p/need. */
const tLabel = (it: Pick<CandyItemState, 'owned' | 'level' | 'progress'>) => (it.owned ? `T${it.level} · 진행 ${it.progress}/${it.level + 1}` : '미보유');

/**
 * 사탕 세그먼트 — 누적·사용 가능 한 카드 → 도달 보상(세로 트랙) → 교환(상자·다이아 별도 버튼 + 수량 팝업) → 장비 교환(6종, 2026-10-27).
 * 수령·교환은 낙관 갱신(즉시 반영, 실패 시 롤백 — ALREADY는 서버 값으로 맞춤).
 */
export function CandyPanel({ initial }: { initial: CandyOverview }) {
  const [ov, setOv] = useState(initial);
  const [pending, startTransition] = useTransition();
  const [busyStep, setBusyStep] = useState<number | null>(null);
  const [modal, setModal] = useState<CandyExchangeKind | null>(null);
  const [itemModal, setItemModal] = useState<string | null>(null);
  const { showError, showHeaderToast } = useResourceToast();
  const { optimisticAdjust } = useDiamondActions();

  const claimedSet = useMemo(() => new Set(ov.claimed), [ov.claimed]);
  const open = ov.phase === 'accrue' || ov.phase === 'claim';
  const closedText =
    ov.phase === 'before'
      ? '대회가 시작되면 강화에 성공할 때마다 사탕이 쌓여요.'
      : ov.phase === 'accrue'
        ? `강화에 성공하면 도달한 단계만큼 사탕이 쌓여요. ${HALLOWEEN_ACCRUE_END_LABEL}까지 쌓을 수 있어요.`
        : ov.phase === 'claim'
          ? `사탕 적립은 ${HALLOWEEN_ACCRUE_END_LABEL}에 끝났어요. 받기와 교환은 ${HALLOWEEN_CLAIM_END_DAY}까지 할 수 있어요.`
          : ov.phase === 'ended'
            ? '사탕 교환 기간이 끝났어요.'
            : null;

  // 낙관 갱신(2026-09-22 사용자 요청) — 받음 표시·다이아·토스트를 먼저 반영하고 실패하면 되돌린다.
  // 서버가 '이미 받음'이라 하면 받음 표시는 맞지만 다이아는 이미 들어와 있으니 낙관 증가분만 되돌린다(2026-09-23 감사).
  const claim = (step: number) => {
    if (busyStep !== null || !open) return;
    const def = CANDY_LADDER.find((l) => l.step === step);
    if (!def) return;
    setBusyStep(step);
    setOv((o) => ({ ...o, claimed: [...o.claimed, step].sort((a, b) => a - b), claimable: Math.max(0, o.claimable - 1) }));
    optimisticAdjust(BigInt(def.diamond));
    showHeaderToast({ title: `💎 ${n(def.diamond)} 획득!`, detail: def.title ? `보급상자 ${n(def.boxes)}개 · 한정 칭호 지급` : `보급상자 ${n(def.boxes)}개 지급` });
    const rollback = (message: string) => {
      setOv((o) => ({ ...o, claimed: o.claimed.filter((c) => c !== step), claimable: o.claimable + 1 }));
      optimisticAdjust(-BigInt(def.diamond));
      showError(message);
    };
    startTransition(async () => {
      try {
        const r = await claimCandyStepAction(step);
        if (r.status !== 'success' && r.code === 'ALREADY') optimisticAdjust(-BigInt(def.diamond));
        else if (r.status !== 'success') rollback(r.message);
      } catch {
        rollback('지금은 받을 수 없어요. 잠시 후 다시 시도해 주세요.');
      } finally {
        setBusyStep(null);
      }
    });
  };

  // 교환도 낙관 갱신 — 팝업을 바로 닫고 사탕·다이아를 먼저 움직인다. 실패하면 되돌리고 사유를 보여 준다.
  const exchange = (kind: CandyExchangeKind, count: number) => {
    const def = CANDY_EXCHANGE[kind];
    const cost = def.candy * count;
    const diamond = kind === 'diamond' ? CANDY_EXCHANGE.diamond.diamond * count : 0;
    const boxes = kind === 'box' ? CANDY_EXCHANGE.box.boxes * count : 0;
    setModal(null);
    setOv((o) => ({ ...o, spent: o.spent + cost, available: o.available - cost }));
    if (diamond > 0) optimisticAdjust(BigInt(diamond));
    showHeaderToast({
      title: diamond > 0 ? `💎 ${n(diamond)} 교환!` : `📦 상자 ${n(boxes)}개 교환!`,
      detail: `사탕 ${n(cost)} 사용`,
    });
    const rollback = (message: string) => {
      setOv((o) => ({ ...o, spent: o.spent - cost, available: o.available + cost }));
      if (diamond > 0) optimisticAdjust(-BigInt(diamond));
      showError(message);
    };
    exchangeCandyAction(kind, count)
      .then((r) => {
        if (r.status !== 'success') rollback(r.message);
        else setOv((o) => ({ ...o, available: r.available, spent: o.total - r.available }));
      })
      .catch(() => rollback('지금은 교환할 수 없어요. 잠시 후 다시 시도해 주세요.'));
  };

  // 장비 교환 — 낙관 갱신(2026-10-27 사용자 요청): 사탕 차감과 장비 상태(초월·진행도·교환 가능 개수)를 순수 규칙(simulateItemCopies)으로
  // 먼저 반영하고 토스트도 바로 띄운다. 서버 응답이 오면 그 값으로 맞추고, 실패하면 스냅샷으로 되돌린다(.catch 필수).
  const exchangeItem = (code: string, count: number) => {
    const it = ov.items.find((i) => i.code === code);
    if (!it) return;
    const cost = CANDY_ITEM_EXCHANGE.candy * count;
    const prevItems = ov.items;
    const sim = simulateItemCopies(it.owned ? { level: it.level, progress: it.progress } : null, count);
    const next: CandyItemState = { ...it, owned: true, level: sim.level, progress: sim.progress, allowed: allowedItemCopies(ov.maxTranscend, { level: sim.level, progress: sim.progress }) };
    setItemModal(null);
    setOv((o) => ({ ...o, spent: o.spent + cost, available: o.available - cost, items: o.items.map((x) => (x.code === code ? next : x)) }));
    if (sim.transcended > 0) showHeaderToast({ title: `${it.name} T${sim.level} 초월!`, detail: `초월 ${sim.transcended}단계 상승 · 사탕 ${n(cost)} 사용` });
    else if (sim.acquired) showHeaderToast({ title: `${it.name} 획득!`, detail: `인벤토리에서 확인할 수 있어요 · 사탕 ${n(cost)} 사용` });
    else showHeaderToast({ title: `${it.name} ${n(count)}개 교환!`, detail: `초월 진행 ${sim.progress}/${sim.level + 1} · 사탕 ${n(cost)} 사용` });
    const rollback = (message: string) => {
      setOv((o) => ({ ...o, spent: o.spent - cost, available: o.available + cost, items: prevItems }));
      showError(message);
    };
    exchangeCandyItemAction(code, count)
      .then((r) => {
        if (r.status !== 'success') {
          rollback(r.message);
          return;
        }
        // 서버 값으로 정합(동시 개봉 등으로 미리보기와 다를 수 있다).
        setOv((o) => ({
          ...o,
          available: r.available,
          spent: o.total - r.available,
          maxTranscend: r.maxTranscend,
          items: o.items.map((x) => (x.code === code ? r.item : x)),
        }));
      })
      .catch(() => rollback('지금은 교환할 수 없어요. 잠시 후 다시 시도해 주세요.'));
  };

  return (
    <div className="mt-3">
      {/* 누적 · 사용 가능 — 큰 사탕 아이콘 + 글로우 숫자 + 다음 단계 진행 바(2026-10-27 UI 시안 4). */}
      <div className="relative overflow-hidden rounded-xl border border-amber-500/40 bg-gradient-to-br from-[#2a1b08] via-[#1a1424] to-[#1a1424] px-3 py-3">
        <div aria-hidden className="absolute -right-6 -top-6 h-28 w-28 rounded-full bg-amber-500/15 blur-2xl" />
        <div className="relative flex items-center gap-3">
          <span className="drop-shadow-[0_0_10px_rgba(251,191,36,0.5)]">
            <CandyIcon size={48} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[10.5px] text-zinc-400">누적 사탕</div>
            <b className="block font-mono text-[26px] leading-none tabular-nums text-amber-200" style={{ textShadow: '0 0 14px rgba(251,191,36,0.45)' }}>
              {n(ov.total)}
            </b>
          </div>
          <div className="text-right">
            <div className="text-[10.5px] text-zinc-400">사용 가능</div>
            <b className="font-mono text-[18px] tabular-nums text-emerald-300">{n(ov.available)}</b>
          </div>
        </div>
        {(() => {
          const nxt = nextCandyStep(ov.total);
          const prevAt = nxt ? (CANDY_LADDER.filter((l) => l.at < nxt.at).at(-1)?.at ?? 0) : CANDY_LADDER[CANDY_LADDER.length - 1]!.at;
          const pct = nxt ? Math.max(0, Math.min(100, ((ov.total - prevAt) / (nxt.at - prevAt)) * 100)) : 100;
          return (
            <div className="relative mt-3">
              <div className="flex justify-between text-[10px] text-zinc-400">
                <span>{nxt ? `다음 단계 ${n(nxt.at)}까지` : '모든 단계 도달'}</span>
                <span className="font-mono tabular-nums text-amber-200">{nxt ? `${n(nxt.remain)}개 남음` : `${n(prevAt)} 달성`}</span>
              </div>
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-black/40">
                <div className="h-full rounded-full bg-gradient-to-r from-orange-500 via-amber-400 to-amber-200 shadow-[0_0_8px_rgba(251,191,36,0.6)] transition-[width] duration-500" style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })()}
      </div>
      {closedText ? <p className="mt-2 text-[11px] text-zinc-500">{closedText}</p> : null}

      {/* 도달 보상 */}
      <p className="mb-1.5 mt-4 text-[12.5px] font-bold">
        도달 보상
      </p>
      {/* "사탕 길"(2026-10-27 UI 시안 5) — 주황→보라 트랙, 노드는 잭오랜턴 그림(받음=초록 링, 받기=앰버 링·글로우, 미도달=흐림). */}
      <ol className="relative ml-3 flex flex-col gap-1.5 border-l-[3px] pl-[18px]" style={{ borderImage: 'linear-gradient(to bottom, #f97316, #f59e0b 50%, #7c3aed) 1' }}>
        {CANDY_LADDER.map((l) => {
          const done = claimedSet.has(l.step);
          const ready = !done && ov.total >= l.at && open;
          // 세 상태를 행 전체로 구분(2026-09-23): 받기=앰버 테두리·배경, 받음=흐리게+체크, 미도달=기본.
          // 높이 고정(h-10) + 오른쪽 칸 고정 폭 — 받기→받음으로 바뀔 때 레이아웃이 밀리지 않게.
          const rowCls = ready
            ? 'border-amber-500/60 bg-amber-500/10'
            : done
              ? 'border-transparent opacity-55'
              : 'border-transparent';
          return (
            <li key={l.step} className={`relative -ml-2 grid h-10 grid-cols-[auto_1fr_auto] items-center gap-x-2.5 rounded-lg border pl-2 pr-1.5 ${rowCls}`}>
              <span
                aria-hidden
                className={`absolute top-1/2 -translate-y-1/2 overflow-hidden rounded-full ${
                  done ? 'ring-2 ring-emerald-400/70' : ready ? 'ring-2 ring-amber-400 shadow-[0_0_10px_rgba(251,191,36,0.6)]' : 'opacity-35 grayscale'
                }`}
                style={{ left: l.title ? -26 : -23, width: l.title ? 26 : 20, height: l.title ? 26 : 20 }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={assetUrl('/sprites/halloween/pumpkin-node.png')} alt="" draggable={false} className="h-full w-full object-cover" style={{ imageRendering: 'pixelated' }} />
              </span>
              <span className={`font-mono text-[13px] tabular-nums ${ready ? 'font-bold text-amber-200' : ''}`}>{n(l.at)}</span>
              <span className="flex min-w-0 items-center gap-1.5 text-[11px] text-zinc-400">
                <span className="truncate">
                  💎{n(l.diamond)} · 📦{l.boxes}
                </span>
                {/* 6만·15만 단계는 한정 칭호도 함께(2026-10-26 확정: 6만 시월의 마녀 · 15만 별사탕) — 순위 보상표처럼 실제 칭호로 미리보기(2026-10-27). */}
                {l.title ? (
                  <span className="shrink-0 text-[11px]">
                    <TitleTag code={l.title} />
                  </span>
                ) : null}
              </span>
              <span className="flex w-[68px] justify-end text-[10.5px]">
                {done ? (
                  <span className="rounded-md border border-emerald-700/60 px-2 py-1 font-bold text-emerald-300">✓ 받음</span>
                ) : ready ? (
                  <button
                    type="button"
                    disabled={busyStep !== null || pending}
                    onClick={() => claim(l.step)}
                    className="rounded-md bg-amber-500 px-3 py-1 text-[11px] font-extrabold text-zinc-950 transition active:scale-[0.97] disabled:opacity-60"
                  >
                    받기
                  </button>
                ) : (
                  <span className="text-zinc-500">{ov.total >= l.at ? '기간 종료' : `${n(l.at - ov.total)} 남음`}</span>
                )}
              </span>
            </li>
          );
        })}
      </ol>

      {/* 교환 */}
      <p className="mb-1.5 mt-4 text-[12.5px] font-bold">
        교환
      </p>
      <div className="grid grid-cols-2 gap-2">
        {(
          [
            { kind: 'box' as const, title: `📦 상자 ${CANDY_EXCHANGE.box.boxes}개`, sub: `${n(CANDY_EXCHANGE.box.candy)} 사탕` },
            { kind: 'diamond' as const, title: `💎 ${CANDY_EXCHANGE.diamond.diamond}`, sub: `${n(CANDY_EXCHANGE.diamond.candy)} 사탕` },
          ] as const
        ).map((x) => {
          const need = CANDY_EXCHANGE[x.kind].candy - ov.available;
          // 버튼이 왜 눌리지 않는지 그 자리에서 알린다(2026-09-23 UX 점검): 부족분 또는 기간 종료.
          const sub = !open ? `${x.sub} · 기간 종료` : need > 0 ? (ov.phase === 'claim' ? `사탕 ${n(need)}개 모자라요` : `사탕 ${n(need)}개 더 모으면 교환할 수 있어요`) : x.sub;
          return (
            <div key={x.kind} className="flex flex-col gap-1.5 rounded-xl border border-violet-300/15 bg-[#1a1424] px-3 py-2.5">
              <b className="text-[13px]">{x.title}</b>
              <span className={`min-h-[30px] break-keep text-[10.5px] leading-snug [overflow-wrap:anywhere] ${open && need > 0 ? 'text-amber-300/80' : 'text-zinc-500'}`}>{sub}</span>
              <button
                type="button"
                disabled={!open || ov.available < CANDY_EXCHANGE[x.kind].candy}
                onClick={() => setModal(x.kind)}
                className="mt-auto rounded-md bg-amber-600 py-1.5 text-[11px] font-extrabold text-white transition active:scale-[0.97] disabled:bg-zinc-700 disabled:text-zinc-400"
              >
                교환
              </button>
            </div>
          );
        })}
      </div>

      {/* 장비 교환(2026-10-27) — 6종 각 1개 = 사탕 100. 교환 뒤 초월 단계가 내 최고 초월을 넘지 못한다(allowedItemCopies).
          뒤에 사탕 바구니 그림을 흐리게 깔고(UI 시안 3), 세트별 두 묶음으로(시안 7). */}
      <div className="relative -mx-4 mt-4 overflow-hidden px-4 pb-2 pt-1">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={assetUrl('/sprites/halloween/banner-candy.png')} alt="" aria-hidden draggable={false} className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-[0.14]" style={{ imageRendering: 'pixelated' }} />
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-gradient-to-b from-[#0f0b16] via-transparent to-[#0f0b16]" />
        <div className="relative">
      <p className="mb-0.5 text-[12.5px] font-bold">할로윈 장비 교환</p>
      <p className="mb-1.5 text-[10.5px] text-zinc-500">
        {ov.maxTranscend > 0 ? <>내 최고 초월 <b className="text-zinc-300">T{ov.maxTranscend}</b>까지 올릴 수 있어요</> : <>없는 장비를 1개씩 받을 수 있어요(다른 장비 초월이 오르면 더 받을 수 있어요)</>}
      </p>
      {(
        [
          { key: 'smith', label: '대장장이 세트', dot: 'bg-orange-400', text: 'text-orange-300', ring: 'border-orange-500/25' },
          { key: 'vamp', label: '꼬마 뱀파이어 세트', dot: 'bg-fuchsia-400', text: 'text-fuchsia-300', ring: 'border-fuchsia-500/25' },
        ] as const
      ).map((g) => (
        <div key={g.key}>
          <p className={`mb-1 mt-2 flex items-center gap-1.5 text-[10.5px] font-bold ${g.text}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${g.dot}`} />
            {g.label}
          </p>
          <ul className={`flex flex-col gap-1.5 rounded-xl border p-1.5 ${g.ring}`}>
        {ov.items.filter((it) => it.code.startsWith(`halloween_${g.key}_`)).map((it) => {
          const canPay = ov.available >= CANDY_ITEM_EXCHANGE.candy;
          const why = !open ? (ov.phase === 'before' ? '시작 전' : '기간 종료') : it.allowed === 0 ? '내 최고 초월 단계예요 · 다른 장비 초월이 오르면 더 받을 수 있어요' : !canPay ? (ov.phase === 'claim' ? `사탕 ${n(CANDY_ITEM_EXCHANGE.candy - ov.available)}개 모자라요` : `사탕 ${n(CANDY_ITEM_EXCHANGE.candy - ov.available)}개 더 모으면 교환할 수 있어요`) : null;
          return (
            <li key={it.code} className="grid grid-cols-[auto_1fr_auto] items-center gap-x-2.5 rounded-xl border border-violet-300/15 bg-[#1a1424]/90 px-2.5 py-2">
              <ItemImg code={it.code} size={36} />
              <div className="min-w-0">
                {/* 이름 오른쪽에 보유 상태(미보유 / T13 · 진행 7/14), 아래 줄에 가격 · 교환 가능 개수(2026-10-27 사용자 요청 배치). */}
                <div className="flex items-baseline justify-between gap-2">
                  <b className="truncate text-[12.5px]">{it.name}</b>
                  <span className="shrink-0 text-[10.5px] tabular-nums text-zinc-400">{tLabel(it)}</span>
                </div>
                <span className={`flex items-center gap-1 truncate text-[10.5px] ${why && open && it.allowed > 0 ? 'text-amber-300/80' : 'text-zinc-500'}`}>
                  {why ?? (
                    <>
                      <CandyIcon size={12} /> {n(CANDY_ITEM_EXCHANGE.candy)} · 교환 가능 {n(it.allowed)}개
                    </>
                  )}
                </span>
              </div>
              <button
                type="button"
                disabled={!open || it.allowed === 0 || !canPay}
                onClick={() => setItemModal(it.code)}
                className="rounded-md bg-amber-600 px-3 py-1.5 text-[11px] font-extrabold text-white transition active:scale-[0.97] disabled:bg-zinc-700 disabled:text-zinc-400"
              >
                교환
              </button>
            </li>
          );
        })}
          </ul>
        </div>
      ))}
        </div>
      </div>
      <p className="mt-3 text-[11px] text-zinc-500">대회가 끝난 뒤 {HALLOWEEN_CLAIM_END_DAY}까지 교환할 수 있어요. 그 뒤 남은 사탕은 사라져요.</p>

      {modal ? (
        <ExchangeModal kind={modal} available={ov.available} onClose={() => setModal(null)} onSubmit={(count) => exchange(modal, count)} />
      ) : null}
      {itemModal ? (
        <ItemExchangeModal
          item={ov.items.find((i) => i.code === itemModal)!}
          maxTranscend={ov.maxTranscend}
          available={ov.available}
          onClose={() => setItemModal(null)}
          onSubmit={(count) => exchangeItem(itemModal, count)}
        />
      ) : null}
    </div>
  );
}

/** 수량 팝업(공통 팝업) — 상품 하나씩. 개수를 조절하면 받는 것·필요한 사탕·교환 뒤 사용 가능이 바뀐다. */
function ExchangeModal({
  kind,
  available,
  onClose,
  onSubmit,
}: {
  kind: CandyExchangeKind;
  available: number;
  onClose: () => void;
  onSubmit: (count: number) => void;
}) {
  const def = CANDY_EXCHANGE[kind];
  const max = Math.max(1, Math.min(CANDY_EXCHANGE_MAX_PER_ACTION, Math.floor(available / def.candy)));
  const [count, setCount] = useState(1);
  const cost = def.candy * count;
  const get = kind === 'diamond' ? `💎 ${n(CANDY_EXCHANGE.diamond.diamond * count)}` : `📦 ${n(CANDY_EXCHANGE.box.boxes * count)}`;
  const submit = () => {
    if (cost > available) return;
    onSubmit(count);
  };
  const step = (d: number) => setCount((c) => Math.min(max, Math.max(1, c + d)));
  const stepBtn = 'grid h-8 w-8 place-items-center rounded-lg bg-zinc-800 text-[16px] font-extrabold text-zinc-100 disabled:opacity-40';
  const edgeBtn = 'h-8 rounded-lg bg-zinc-800 px-2.5 text-[11px] font-bold text-zinc-300 active:opacity-80 disabled:opacity-40';
  return (
    <ModalShell onClose={onClose} onSubmit={submit} label="사탕 교환">
      <ModalLayout
        title={kind === 'diamond' ? `💎 ${n(CANDY_EXCHANGE.diamond.diamond)} 교환` : `📦 상자 ${CANDY_EXCHANGE.box.boxes}개 교환`}
        footer={
          <>
            <ModalButton tone="neutral" onClick={onClose}>
              취소
            </ModalButton>
            <ModalButton tone="primary" onClick={submit} disabled={cost > available}>
              {`${n(cost)} 사탕으로 교환`}
            </ModalButton>
          </>
        }
      >
        {/* 최소 · − 수량 + · 최대 — 좌우 대칭 한 줄(2026-09-23). */}
        <div className="flex items-center justify-center gap-3 pb-0.5 pt-1.5">
          <button type="button" onClick={() => setCount(1)} disabled={count <= 1} className={edgeBtn}>
            최소
          </button>
          <button type="button" aria-label="하나 줄이기" onClick={() => step(-1)} disabled={count <= 1} className={stepBtn}>
            −
          </button>
          <b className="min-w-[28px] text-center font-mono text-[22px] tabular-nums text-amber-200">{count}</b>
          <button type="button" aria-label="하나 늘리기" onClick={() => step(1)} disabled={count >= max} className={stepBtn}>
            +
          </button>
          <button type="button" onClick={() => setCount(max)} disabled={count >= max} className={edgeBtn}>
            최대
          </button>
        </div>
        <dl className="mt-3 grid grid-cols-[1fr_auto] gap-y-1.5 text-[12px]">
          <dt className="text-zinc-400">받는 것</dt>
          <dd className="text-right font-bold">{get}</dd>
          <dt className="text-zinc-400">필요한 사탕</dt>
          <dd className="text-right font-mono tabular-nums">{n(cost)}</dd>
          <dt className="text-zinc-400">교환 뒤 사용 가능</dt>
          <dd className={`text-right font-mono tabular-nums ${available - cost < 0 ? 'text-red-400' : ''}`}>{n(available - cost)}</dd>
        </dl>
      </ModalLayout>
    </ModalShell>
  );
}

/** 장비 교환 수량 팝업 — 상한 = min(교환 가능 개수, 사탕으로 살 수 있는 개수, 99). 교환 뒤 초월 상태를 미리 보여 준다. */
function ItemExchangeModal({
  item,
  maxTranscend,
  available,
  onClose,
  onSubmit,
}: {
  item: CandyItemState;
  maxTranscend: number;
  available: number;
  onClose: () => void;
  onSubmit: (count: number) => void;
}) {
  const price = CANDY_ITEM_EXCHANGE.candy;
  // 상한까지 한 번에(2026-10-27 사용자 요청) — 교환 가능 개수와 사탕으로 살 수 있는 개수 중 작은 값. 숫자 입력도 받는다.
  const max = Math.max(1, Math.min(CANDY_ITEM_EXCHANGE.maxPerAction, item.allowed, Math.floor(available / price)));
  const [count, setCount] = useState(1);
  const [typed, setTyped] = useState('1');
  const setBoth = (c: number) => {
    const v = Math.min(max, Math.max(1, Math.floor(c)));
    setCount(v);
    setTyped(String(v));
  };
  const cost = price * count;
  const after = simulateItemCopies(item.owned ? { level: item.level, progress: item.progress } : null, count);
  const submit = () => {
    if (cost > available || count > item.allowed) return;
    onSubmit(count);
  };
  const step = (d: number) => setBoth(count + d);
  const stepBtn = 'grid h-8 w-8 place-items-center rounded-lg bg-zinc-800 text-[16px] font-extrabold text-zinc-100 disabled:opacity-40';
  const edgeBtn = 'h-8 rounded-lg bg-zinc-800 px-2.5 text-[11px] font-bold text-zinc-300 active:opacity-80 disabled:opacity-40';
  return (
    <ModalShell onClose={onClose} onSubmit={submit} label="장비 교환">
      <ModalLayout
        title={`${item.name} 교환`}
        subtitle={`1개에 사탕 ${n(price)} · 내 최고 초월 T${maxTranscend}까지 교환할 수 있어요`}
        footer={
          <>
            <ModalButton tone="neutral" onClick={onClose}>
              취소
            </ModalButton>
            <ModalButton tone="primary" onClick={submit} disabled={cost > available || count > item.allowed}>
              {`${n(cost)} 사탕으로 교환`}
            </ModalButton>
          </>
        }
      >
        <div className="flex items-center gap-2.5 pt-1">
          <ItemImg code={item.code} size={44} />
          <div className="min-w-0 text-[11.5px] text-zinc-400">
            <div>지금 {tLabel(item)}</div>
            <div>교환 뒤 <b className="text-amber-200">T{after.level} · 진행 {after.progress}/{after.level + 1}</b>{after.transcended > 0 ? ` (초월 +${after.transcended})` : after.acquired ? ' (획득)' : ''}</div>
          </div>
        </div>
        <div className="flex items-center justify-center gap-3 pb-0.5 pt-2.5">
          <button type="button" onClick={() => setBoth(1)} disabled={count <= 1} className={edgeBtn}>
            최소
          </button>
          <button type="button" aria-label="하나 줄이기" onClick={() => step(-1)} disabled={count <= 1} className={stepBtn}>
            −
          </button>
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            aria-label="교환 개수"
            value={typed}
            onChange={(e) => {
              const raw = e.target.value.replace(/[^0-9]/g, '');
              setTyped(raw);
              const v = Number(raw);
              if (raw !== '' && Number.isFinite(v)) setCount(Math.min(max, Math.max(1, v)));
            }}
            onBlur={() => setBoth(Number(typed) || 1)}
            className="h-9 w-[72px] rounded-lg border border-zinc-700 bg-zinc-950 text-center font-mono text-[20px] font-extrabold tabular-nums text-amber-200 outline-none focus:border-amber-500"
          />
          <button type="button" aria-label="하나 늘리기" onClick={() => step(1)} disabled={count >= max} className={stepBtn}>
            +
          </button>
          <button type="button" onClick={() => setBoth(max)} disabled={count >= max} className={edgeBtn}>
            최대
          </button>
        </div>
        <p className="mt-1 text-center text-[10.5px] text-zinc-500">한 번에 {n(max)}개까지</p>
        <dl className="mt-3 grid grid-cols-[1fr_auto] gap-y-1.5 text-[12px]">
          <dt className="text-zinc-400">받는 것</dt>
          <dd className="text-right font-bold">{item.name} ×{n(count)}</dd>
          <dt className="text-zinc-400">필요한 사탕</dt>
          <dd className="text-right font-mono tabular-nums">{n(cost)}</dd>
          <dt className="text-zinc-400">교환 뒤 사용 가능</dt>
          <dd className={`text-right font-mono tabular-nums ${available - cost < 0 ? 'text-red-400' : ''}`}>{n(available - cost)}</dd>
          <dt className="text-zinc-400">이 장비 교환 가능</dt>
          <dd className="text-right font-mono tabular-nums">{n(item.allowed)}개</dd>
        </dl>
      </ModalLayout>
    </ModalShell>
  );
}
