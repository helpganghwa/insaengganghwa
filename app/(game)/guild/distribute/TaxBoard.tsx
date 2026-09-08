'use client';

import Link from 'next/link';
import { useMemo, useState, useTransition } from 'react';

import { useResourceToast } from '@/components/ResourceToast';
import { useDiamondActions } from '@/components/DiamondContext';
import { ModalShell } from '@/components/ModalShell';
import { ModalLayout, ModalButton } from '@/components/ModalLayout';
import { Ticker } from '@/components/Ticker';
import { GUILD_EXECUTOR_TAX_CUT } from '@/lib/game/guild/balance';
import type { TaxCollectZone } from '@/lib/game/guild/queries';

import { collectAllTaxAction, collectTaxAction } from '../actions';
import { guildErrMsg } from '../errors-msg';
import { DistributeBoard, type DistributeMember } from './DistributeBoard';

export type TaxTab = 'collect' | 'distribute';

export type CollectView = {
  zones: TaxCollectZone[];
  readyCount: number;
  readySum: string;
  waitCount: number;
  noneCount: number;
  noneSum: string;
  readyExecutors: number;
};

const fmt = (n: bigint | number) => Number(n).toLocaleString('ko-KR');
/** 남은 ms → H:MM:SS(72h 쿨다운은 시간 단위가 커서 일 단위로 접지 않는다 — 지도 팝업과 같은 표기). */
function hms(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}
/** 집행관 몫 — 서버(collect.ts)와 같은 구역별 floor. 합산 뒤 나누면 1💎씩 어긋난다. */
function executorCut(tax: bigint) {
  return (tax * BigInt(Math.round(GUILD_EXECUTOR_TAX_CUT * 100))) / 100n;
}

/**
 * 세금 수금·분배(2026-09-08, S안) — 한 화면을 **수금 | 분배** 세그먼트로 나눈다.
 * 분배는 종전 DistributeBoard 그대로. 수금은 요약 3칸 + 구역 표 + '모두 수금'.
 * 수금 직후 서버 액션 재렌더로 곳간 숫자가 늘어난 채 분배 탭으로 넘어간다(§11.7).
 */
export function TaxBoard({
  myUserId,
  initialTab,
  collect,
  pool,
  members,
}: {
  myUserId: string;
  initialTab: TaxTab;
  collect: CollectView;
  pool: string;
  members: DistributeMember[];
}) {
  const [tab, setTab] = useState<TaxTab>(initialTab);
  const switchTab = (next: TaxTab) => {
    setTab(next);
    // 새로고침·뒤로가기에도 탭이 유지되도록 주소만 바꾼다(내비게이션 없음).
    try {
      const u = new URL(window.location.href);
      u.searchParams.set('tab', next);
      window.history.replaceState(window.history.state, '', u.toString());
    } catch {
      /* noop */
    }
  };

  return (
    <section className="mt-3">
      <div role="tablist" className="flex gap-1 rounded-xl bg-zinc-100 p-1 dark:bg-zinc-900">
        {(
          [
            { key: 'collect', label: '수금' },
            { key: 'distribute', label: '분배' },
          ] as { key: TaxTab; label: string }[]
        ).map((t) => (
          <button
            key={t.key}
            role="tab"
            type="button"
            aria-selected={tab === t.key}
            onClick={() => switchTab(t.key)}
            className={`flex-1 rounded-lg py-1.5 text-[12px] font-bold transition ${
              tab === t.key
                ? 'bg-white text-amber-600 shadow-sm dark:bg-zinc-950 dark:text-amber-400'
                : 'text-zinc-500'
            }`}
          >
            {t.label}
            {t.key === 'collect' && collect.readyCount > 0 ? (
              <span className="ml-1 rounded-full bg-amber-500/15 px-1.5 text-[10px] tabular-nums text-amber-600 dark:text-amber-400">
                {collect.readyCount}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      {tab === 'collect' ? (
        <CollectPanel myUserId={myUserId} view={collect} />
      ) : (
        <DistributeBoard myUserId={myUserId} pool={pool} members={members} />
      )}
    </section>
  );
}

type Target = { kind: 'all' } | { kind: 'zone'; zone: TaxCollectZone };

function CollectPanel({ myUserId, view }: { myUserId: string; view: CollectView }) {
  const { showHeaderToast, showError } = useResourceToast();
  const { optimisticAdjust } = useDiamondActions();
  const [pending, start] = useTransition();
  const [ask, setAsk] = useState<Target | null>(null);

  const ready = useMemo(() => view.zones.filter((z) => z.status === 'ready'), [view.zones]);

  /** 확인 팝업 수치 — 대상(전체/1곳)에 따라. */
  const plan = useMemo(() => {
    if (!ask) return null;
    const zs = ask.kind === 'all' ? ready : [ask.zone];
    const total = zs.reduce((n, z) => n + BigInt(z.tax), 0n);
    const exec = zs.reduce((n, z) => n + executorCut(BigInt(z.tax)), 0n);
    const executors = new Set(zs.map((z) => z.executorUserId)).size;
    return { zs, total, exec, guild: total - exec, executors };
  }, [ask, ready]);

  const run = () => {
    if (!ask || !plan || pending) return;
    const target = ask;
    setAsk(null);
    start(async () => {
      if (target.kind === 'all') {
        const r = await collectAllTaxAction().catch(() => null);
        if (!r || r.status !== 'success') {
          showError(r?.code ? guildErrMsg(r.code) : '전송에 실패했어요. 다시 시도해 주세요.');
          return;
        }
        const mine = BigInt(r.myGain);
        if (mine > 0n) optimisticAdjust(mine);
        showHeaderToast({
          title: `세금 수금 완료 ${r.zones}곳 · ${fmt(BigInt(r.total))}💎`,
          detail: r.failed > 0 ? `${r.failed}곳은 그 사이 수금할 수 없게 되어 건너뛰었습니다` : undefined,
        });
      } else {
        const r = await collectTaxAction(target.zone.id).catch(() => null);
        if (!r || r.status !== 'success') {
          showError(r?.code ? guildErrMsg(r.code) : '전송에 실패했어요. 다시 시도해 주세요.');
          return;
        }
        const mine = BigInt(r.myGain);
        if (mine > 0n) optimisticAdjust(mine);
        const total = BigInt(r.executorGain) + BigInt(r.guildGain);
        showHeaderToast({ title: `${target.zone.name} 수금 완료 ${fmt(total)}💎` });
      }
      // router.refresh() 불필요 — 액션의 revalidatePath('/guild/distribute') 재렌더가 새 목록을 실어 온다.
    });
  };

  const readySum = BigInt(view.readySum);

  return (
    <>
      {/* 요약 3칸 — 수금 가능이 주인공, 나머지는 상태 카운트. */}
      <div className="mt-2.5 grid grid-cols-3 gap-1.5">
        <div className="rounded-xl border border-amber-500/40 bg-amber-50/50 px-2.5 py-2 dark:border-amber-500/30 dark:bg-amber-500/[0.06]">
          <p className="text-[10px] font-bold tracking-wide text-zinc-400">수금 가능</p>
          <p className="text-[15px] font-extrabold leading-tight tabular-nums text-amber-600 dark:text-amber-400">
            {view.readyCount}곳
          </p>
          <p className="text-[10.5px] font-bold tabular-nums text-amber-600/90 dark:text-amber-400/90">
            💎{fmt(readySum)}
          </p>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white px-2.5 py-2 dark:border-zinc-800 dark:bg-zinc-950">
          <p className="text-[10px] font-bold tracking-wide text-zinc-400">대기</p>
          <p className="text-[15px] font-extrabold leading-tight tabular-nums text-zinc-700 dark:text-zinc-200">
            {view.waitCount}곳
          </p>
          <p className="text-[10.5px] text-zinc-400">쿨타임 · 세금 0</p>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white px-2.5 py-2 dark:border-zinc-800 dark:bg-zinc-950">
          <p className="text-[10px] font-bold tracking-wide text-zinc-400">집행관 없음</p>
          <p
            className={`text-[15px] font-extrabold leading-tight tabular-nums ${
              view.noneCount > 0 ? 'text-red-500' : 'text-zinc-700 dark:text-zinc-200'
            }`}
          >
            {view.noneCount}곳
          </p>
          <p className="text-[10.5px] tabular-nums text-zinc-400">
            {view.noneCount > 0 ? `💎${fmt(BigInt(view.noneSum))} 동결` : '수금 불가 없음'}
          </p>
        </div>
      </div>

      {/* 구역 표 — 수금 가능 → 대기(가까운 순) → 집행관 공석. */}
      {view.zones.length === 0 ? (
        <div className="mt-2 rounded-xl border border-dashed border-zinc-300 px-3 py-6 text-center text-[12px] text-zinc-500 dark:border-zinc-700">
          점령지가 없습니다. 점령전에서 구역을 차지하면 세금이 쌓입니다.
        </div>
      ) : (
        <ul className="mt-2 rounded-xl border border-zinc-200 bg-white px-3 dark:border-zinc-800 dark:bg-zinc-950">
          {view.zones.map((z) => (
            <li
              key={z.id}
              className="flex items-center gap-2 border-b border-zinc-100 py-2 last:border-b-0 dark:border-zinc-900"
            >
              <span aria-hidden className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: z.color }} />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-1.5">
                  <span className="truncate text-[12.5px] font-semibold">{z.name}</span>
                  {z.executorUserId === myUserId ? (
                    <span className="shrink-0 text-[9px] font-bold text-zinc-400">내 구역</span>
                  ) : null}
                </div>
                <div className="mt-0.5 truncate text-[10.5px] text-zinc-500">
                  {z.executorNickname ? (
                    <>
                      집행관 <b className="text-zinc-700 dark:text-zinc-300">{z.executorNickname}</b>
                    </>
                  ) : (
                    <span className="text-red-500/90">집행관 공석 — 수금 불가</span>
                  )}
                </div>
              </div>
              <span
                className={`shrink-0 font-mono text-[12.5px] font-extrabold tabular-nums ${
                  z.status === 'ready'
                    ? 'text-amber-600 dark:text-amber-400'
                    : z.status === 'none'
                      ? 'text-zinc-400 line-through decoration-zinc-400/60'
                      : 'text-zinc-600 dark:text-zinc-300'
                }`}
              >
                💎{fmt(BigInt(z.tax))}
              </span>
              <div className="w-[72px] shrink-0 text-right">
                {z.status === 'ready' ? (
                  <button
                    type="button"
                    onClick={() => setAsk({ kind: 'zone', zone: z })}
                    disabled={pending}
                    className="rounded-md bg-amber-600 px-3 py-1 text-[10.5px] font-bold text-white active:opacity-80 disabled:opacity-40"
                  >
                    수금
                  </button>
                ) : z.status === 'wait' ? (
                  z.readyAt != null ? (
                    <Ticker>
                      {(now) => (
                        <span className="font-mono text-[10.5px] tabular-nums text-zinc-500">
                          {hms(z.readyAt! - now)}
                        </span>
                      )}
                    </Ticker>
                  ) : (
                    <span className="text-[10.5px] text-zinc-400">세금 없음</span>
                  )
                ) : (
                  <Link
                    prefetch={false}
                    href="/guild/deploy"
                    className="text-[10.5px] font-bold text-red-500/90 underline decoration-red-500/30 underline-offset-2"
                  >
                    지정하기
                  </Link>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <button
        type="button"
        onClick={() => setAsk({ kind: 'all' })}
        disabled={pending || view.readyCount === 0}
        className="mt-2.5 w-full rounded-xl bg-amber-600 py-2.5 text-sm font-bold text-white disabled:opacity-40"
      >
        {view.readyCount > 0 ? `모두 수금 ${fmt(readySum)}💎 · ${view.readyCount}곳` : '수금할 구역이 없습니다'}
      </button>
      <p className="mt-1.5 px-1 text-[10.5px] leading-relaxed text-zinc-400">
        수금하면 구역 세금의 {Math.round(GUILD_EXECUTOR_TAX_CUT * 100)}%는 그 구역 집행관에게, 나머지는 길드 곳간으로 들어갑니다.
        집행관이 없는 구역은 지정 전까지 세금이 동결됩니다.
      </p>

      {/* 확인 — 구역·금액을 되읽어준다(재화 이동, 되돌릴 수 없음). */}
      {ask && plan ? (
        <ModalShell onClose={() => setAsk(null)} onSubmit={run} label="세금 수금 확인">
          <ModalLayout
            title={ask.kind === 'all' ? `${plan.zs.length}곳을 수금할까요?` : `${ask.zone.name}을 수금할까요?`}
            subtitle={
              <>
                <span className="text-zinc-500">구역 세금 합계</span>
                <span className="ml-1.5 font-mono font-bold text-amber-600 dark:text-amber-400">
                  💎{fmt(plan.total)}
                </span>
              </>
            }
            maxBodyClass="max-h-[46vh]"
            footer={
              <>
                <ModalButton tone="ghost" onClick={() => setAsk(null)} disabled={pending}>
                  취소
                </ModalButton>
                <ModalButton tone="primary" onClick={run} disabled={pending}>
                  수금
                </ModalButton>
              </>
            }
          >
            {ask.kind === 'all' ? (
              <ul className="space-y-1">
                {plan.zs.map((z) => (
                  <li key={z.id} className="flex items-center justify-between gap-2 text-[12.5px]">
                    <span className="flex min-w-0 items-center gap-1.5 text-zinc-600 dark:text-zinc-300">
                      <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: z.color }} />
                      <span className="truncate">{z.name}</span>
                    </span>
                    <span className="shrink-0 font-mono font-bold tabular-nums">💎{fmt(BigInt(z.tax))}</span>
                  </li>
                ))}
              </ul>
            ) : null}
            <dl
              className={`space-y-1 text-[12px] ${
                ask.kind === 'all' ? 'mt-3 border-t border-zinc-200 pt-2 dark:border-zinc-700' : ''
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <dt className="text-zinc-500">
                  집행관 몫 {Math.round(GUILD_EXECUTOR_TAX_CUT * 100)}%
                  <span className="ml-1 text-zinc-400">({plan.executors}명)</span>
                </dt>
                <dd className="font-mono font-bold tabular-nums text-zinc-700 dark:text-zinc-200">💎{fmt(plan.exec)}</dd>
              </div>
              <div className="flex items-center justify-between gap-2">
                <dt className="font-bold text-zinc-700 dark:text-zinc-200">곳간에 들어오는 금액</dt>
                <dd className="font-mono font-extrabold tabular-nums text-amber-600 dark:text-amber-400">
                  💎{fmt(plan.guild)}
                </dd>
              </div>
            </dl>
            {ask.kind === 'all' && view.noneCount > 0 ? (
              <p className="mt-2 text-[11px] text-zinc-500">
                집행관이 없는 {view.noneCount}곳(💎{fmt(BigInt(view.noneSum))})은 수금되지 않습니다.
              </p>
            ) : null}
          </ModalLayout>
        </ModalShell>
      ) : null}
    </>
  );
}
