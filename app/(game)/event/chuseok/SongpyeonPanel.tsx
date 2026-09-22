'use client';

import { useMemo, useState, useTransition } from 'react';

import { useDiamondActions } from '@/components/DiamondContext';
import { ModalShell } from '@/components/ModalShell';
import { ModalButton, ModalLayout } from '@/components/ModalLayout';
import { useResourceToast } from '@/components/ResourceToast';
import { assetUrl } from '@/lib/asset-versions';
import {
  SONGPYEON_EXCHANGE,
  SONGPYEON_EXCHANGE_MAX_PER_ACTION,
  SONGPYEON_LADDER,
  nextLadderStep,
  type SongpyeonExchangeKind,
} from '@/lib/game/chuseok/config';
import type { SongpyeonOverview } from '@/lib/game/chuseok/songpyeon';

import { claimSongpyeonStepAction, exchangeSongpyeonAction } from './actions';

const n = (v: number) => v.toLocaleString('ko-KR');

function SongpyeonIcon({ size = 16 }: { size?: number }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={assetUrl('/sprites/chuseok/songpyeon.png')}
      alt=""
      aria-hidden
      width={size}
      height={size}
      draggable={false}
      className="inline-block align-[-0.15em]"
      style={{ imageRendering: 'pixelated' }}
    />
  );
}

/**
 * 송편 세그먼트 — 누적·사용 가능 한 카드 → 도달 보상(세로 트랙) → 교환(상자·다이아 별도 버튼 + 수량 팝업).
 * 수령·교환은 낙관 갱신 없이 서버 응답으로 상태를 바꾼다(금액이 크고 한 번에 한 번이라 지연 체감이 작다).
 */
export function SongpyeonPanel({ initial }: { initial: SongpyeonOverview }) {
  const [ov, setOv] = useState(initial);
  const [pending, startTransition] = useTransition();
  const [busyStep, setBusyStep] = useState<number | null>(null);
  const [modal, setModal] = useState<SongpyeonExchangeKind | null>(null);
  const { showError, showHeaderToast } = useResourceToast();
  const { optimisticAdjust } = useDiamondActions();

  const claimedSet = useMemo(() => new Set(ov.claimed), [ov.claimed]);
  const next = nextLadderStep(ov.total);
  const open = ov.phase === 'accrue' || ov.phase === 'claim';
  const closedText =
    ov.phase === 'before' ? '대회가 시작되면 강화에 성공할 때마다 송편이 쌓여요.' : ov.phase === 'ended' ? '한가위 송편은 끝났어요.' : null;

  // 낙관 갱신(2026-09-22 사용자 요청) — 받음 표시·다이아·토스트를 먼저 반영하고 실패하면 되돌린다.
  // 서버가 '이미 받음'이라 하면 화면이 맞는 것이므로 되돌리지 않는다.
  const claim = (step: number) => {
    if (busyStep !== null || !open) return;
    const def = SONGPYEON_LADDER.find((l) => l.step === step);
    if (!def) return;
    setBusyStep(step);
    setOv((o) => ({ ...o, claimed: [...o.claimed, step].sort((a, b) => a - b), claimable: Math.max(0, o.claimable - 1) }));
    optimisticAdjust(BigInt(def.diamond));
    showHeaderToast({ title: `💎 ${n(def.diamond)} 획득!`, detail: `보급상자 ${n(def.boxes)}개 지급` });
    const rollback = (message: string) => {
      setOv((o) => ({ ...o, claimed: o.claimed.filter((c) => c !== step), claimable: o.claimable + 1 }));
      optimisticAdjust(-BigInt(def.diamond));
      showError(message);
    };
    startTransition(async () => {
      try {
        const r = await claimSongpyeonStepAction(step);
        if (r.status !== 'success' && r.code !== 'ALREADY') rollback(r.message);
      } catch {
        rollback('지금은 받을 수 없어요. 잠시 후 다시 시도해 주세요.');
      } finally {
        setBusyStep(null);
      }
    });
  };

  // 교환도 낙관 갱신 — 팝업을 바로 닫고 송편·다이아를 먼저 움직인다. 실패하면 되돌리고 사유를 보여 준다.
  const exchange = (kind: SongpyeonExchangeKind, count: number) => {
    const def = SONGPYEON_EXCHANGE[kind];
    const cost = def.songpyeon * count;
    const diamond = kind === 'diamond' ? SONGPYEON_EXCHANGE.diamond.diamond * count : 0;
    const boxes = kind === 'box' ? SONGPYEON_EXCHANGE.box.boxes * count : 0;
    setModal(null);
    setOv((o) => ({ ...o, spent: o.spent + cost, available: o.available - cost }));
    if (diamond > 0) optimisticAdjust(BigInt(diamond));
    showHeaderToast({
      title: diamond > 0 ? `💎 ${n(diamond)} 교환!` : `📦 상자 ${n(boxes)}개 교환!`,
      detail: `송편 ${n(cost)} 사용`,
    });
    const rollback = (message: string) => {
      setOv((o) => ({ ...o, spent: o.spent - cost, available: o.available + cost }));
      if (diamond > 0) optimisticAdjust(-BigInt(diamond));
      showError(message);
    };
    exchangeSongpyeonAction(kind, count)
      .then((r) => {
        if (r.status !== 'success') rollback(r.message);
        else setOv((o) => ({ ...o, available: r.available, spent: o.total - r.available }));
      })
      .catch(() => rollback('지금은 교환할 수 없어요. 잠시 후 다시 시도해 주세요.'));
  };

  return (
    <div className="mt-3">
      {/* 누적 · 사용 가능 */}
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2.5 rounded-xl border border-amber-500/50 bg-zinc-900 px-3 py-2.5">
        <div className="flex flex-col">
          <span className="text-[10.5px] text-zinc-400">누적 송편</span>
          <b className="text-[20px] font-mono tabular-nums text-amber-200">
            <SongpyeonIcon /> {n(ov.total)}
          </b>
          <small className="text-[10px] text-zinc-500">{next ? `다음 보상까지 ${n(next.remain)}` : '모든 단계 도달'}</small>
        </div>
        <span className="h-9 w-px bg-zinc-800" />
        <div className="flex flex-col">
          <span className="text-[10.5px] text-zinc-400">사용 가능</span>
          <b className="text-[20px] font-mono tabular-nums text-amber-200">
            <SongpyeonIcon /> {n(ov.available)}
          </b>
          <small className="text-[10px] text-zinc-500">교환에 쓴 {n(ov.spent)}</small>
        </div>
      </div>
      {closedText ? <p className="mt-2 text-[11px] text-zinc-500">{closedText}</p> : null}

      {/* 도달 보상 */}
      <p className="mb-1.5 mt-4 text-[12.5px] font-bold">
        도달 보상 <small className="ml-1.5 font-medium text-zinc-400">누적 송편으로 따져요. 교환에 써도 줄지 않아요.</small>
      </p>
      <ol className="relative ml-2 flex flex-col gap-2.5 border-l-2 border-zinc-800 pl-[18px]">
        {SONGPYEON_LADDER.map((l) => {
          const done = claimedSet.has(l.step);
          const ready = !done && ov.total >= l.at && open;
          return (
            <li key={l.step} className="relative grid grid-cols-[auto_1fr_auto] items-center gap-x-2.5 gap-y-0.5">
              <span
                className={`absolute -left-[25px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-zinc-950 ${
                  done ? 'bg-emerald-500' : ready ? 'bg-amber-500 shadow-[0_0_0_3px_rgba(245,158,11,0.25)]' : 'bg-zinc-700'
                }`}
              />
              <span className="font-mono text-[13px] tabular-nums">{n(l.at)}</span>
              <span className="text-[11px] text-zinc-400">
                💎{n(l.diamond)} · 📦{l.boxes}
              </span>
              <span className="col-start-3 row-span-2 row-start-1 text-[10.5px]">
                {done ? (
                  <span className="text-emerald-300">받음</span>
                ) : ready ? (
                  <button
                    type="button"
                    disabled={busyStep !== null || pending}
                    onClick={() => claim(l.step)}
                    className="rounded-md bg-amber-600 px-2.5 py-1 text-[10.5px] font-extrabold text-white transition active:scale-[0.97] disabled:opacity-60"
                  >
                    {busyStep === l.step ? '받는 중' : '받기'}
                  </button>
                ) : (
                  <span className="text-zinc-500">{ov.total >= l.at ? '기간 종료' : `${n(l.at - ov.total)} 더`}</span>
                )}
              </span>
            </li>
          );
        })}
      </ol>

      {/* 교환 */}
      <p className="mb-1.5 mt-4 text-[12.5px] font-bold">
        교환 <small className="ml-1.5 font-medium text-zinc-400">사용 가능 송편으로 바꿔요</small>
      </p>
      <div className="flex flex-col gap-1.5">
        {(
          [
            { kind: 'box' as const, title: `📦 상자 ${SONGPYEON_EXCHANGE.box.boxes}개`, sub: `${n(SONGPYEON_EXCHANGE.box.songpyeon)} 송편 · 한도 없음` },
            { kind: 'diamond' as const, title: `💎 ${SONGPYEON_EXCHANGE.diamond.diamond}`, sub: `${n(SONGPYEON_EXCHANGE.diamond.songpyeon)} 송편 · 한도 없음` },
          ] as const
        ).map((x) => (
          <div key={x.kind} className="grid grid-cols-[1fr_auto] items-center gap-x-2.5 rounded-xl border border-zinc-800 bg-zinc-900 px-2.5 py-2">
            <b className="text-[12.5px]">{x.title}</b>
            <span className="col-start-1 text-[10.5px] text-zinc-500">{x.sub}</span>
            <button
              type="button"
              disabled={!open || ov.available < SONGPYEON_EXCHANGE[x.kind].songpyeon}
              onClick={() => setModal(x.kind)}
              className="col-start-2 row-span-2 row-start-1 rounded-md bg-amber-600 px-2.5 py-1 text-[10.5px] font-extrabold text-white transition active:scale-[0.97] disabled:bg-zinc-700 disabled:text-zinc-400"
            >
              교환
            </button>
          </div>
        ))}
      </div>
      <p className="mt-3 text-[11px] text-zinc-500">대회가 끝난 뒤 10/3까지 받고 교환할 수 있어요. 그 뒤 남은 송편은 사라져요.</p>

      {modal ? (
        <ExchangeModal kind={modal} available={ov.available} onClose={() => setModal(null)} onSubmit={(count) => exchange(modal, count)} />
      ) : null}
    </div>
  );
}

/** 수량 팝업(공통 팝업) — 상품 하나씩. 개수를 조절하면 받는 것·필요한 송편·교환 뒤 사용 가능이 바뀐다. */
function ExchangeModal({
  kind,
  available,
  onClose,
  onSubmit,
}: {
  kind: SongpyeonExchangeKind;
  available: number;
  onClose: () => void;
  onSubmit: (count: number) => void;
}) {
  const def = SONGPYEON_EXCHANGE[kind];
  const max = Math.max(1, Math.min(SONGPYEON_EXCHANGE_MAX_PER_ACTION, Math.floor(available / def.songpyeon)));
  const [count, setCount] = useState(1);
  const cost = def.songpyeon * count;
  const get = kind === 'diamond' ? `💎 ${n(SONGPYEON_EXCHANGE.diamond.diamond * count)}` : `📦 ${n(SONGPYEON_EXCHANGE.box.boxes * count)}`;
  const submit = () => {
    if (cost > available) return;
    onSubmit(count);
  };
  const step = (d: number) => setCount((c) => Math.min(max, Math.max(1, c + d)));
  const stepBtn = 'grid h-8 w-8 place-items-center rounded-lg bg-zinc-800 text-[16px] font-extrabold text-zinc-100 disabled:opacity-40';
  return (
    <ModalShell onClose={onClose} onSubmit={submit} label="송편 교환">
      <ModalLayout
        title={kind === 'diamond' ? `💎 ${n(SONGPYEON_EXCHANGE.diamond.diamond)} 교환` : `📦 상자 ${SONGPYEON_EXCHANGE.box.boxes}개 교환`}
        subtitle={`한 번에 ${n(def.songpyeon)} 송편 · 한도 없음`}
        footer={
          <>
            <ModalButton tone="neutral" onClick={onClose}>
              취소
            </ModalButton>
            <ModalButton tone="primary" onClick={submit} disabled={cost > available}>
              {`${n(cost)} 송편으로 교환`}
            </ModalButton>
          </>
        }
      >
        <div className="flex items-center justify-center gap-3.5 pb-0.5 pt-1.5">
          <button type="button" aria-label="하나 줄이기" onClick={() => step(-1)} disabled={count <= 1} className={stepBtn}>
            −
          </button>
          <b className="min-w-[28px] text-center font-mono text-[22px] tabular-nums text-amber-200">{count}</b>
          <button type="button" aria-label="하나 늘리기" onClick={() => step(1)} disabled={count >= max} className={stepBtn}>
            +
          </button>
          <button type="button" onClick={() => setCount(max)} className="text-[11px] tabular-nums text-zinc-400 underline-offset-2 active:underline">
            최대 {n(max)}
          </button>
        </div>
        <dl className="mt-3 grid grid-cols-[1fr_auto] gap-y-1.5 text-[12px]">
          <dt className="text-zinc-400">받는 것</dt>
          <dd className="text-right font-bold">{get}</dd>
          <dt className="text-zinc-400">필요한 송편</dt>
          <dd className="text-right font-mono tabular-nums">{n(cost)}</dd>
          <dt className="text-zinc-400">교환 뒤 사용 가능</dt>
          <dd className={`text-right font-mono tabular-nums ${available - cost < 0 ? 'text-red-400' : ''}`}>{n(available - cost)}</dd>
        </dl>
      </ModalLayout>
    </ModalShell>
  );
}
