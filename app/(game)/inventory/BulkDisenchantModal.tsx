'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';

import { useResourceToast } from '@/components/ResourceToast';
import { DIAMOND_PER_DISENCHANT } from '@/lib/game/balance';

import { bulkDisenchantAction, previewBulkDisenchantAction } from './actions';
import type { InvItem } from './InventoryGrid';

type PreviewRow = {
  catalogItemId: number;
  code: string;
  name: string;
  slot: string;
  toDisenchantIds: string[];
  count: number;
  diamondGranted: number;
};
type Preview = {
  status: 'success';
  rows: PreviewRow[];
  totalCount: number;
  totalDiamond: number;
};
type ExecResult = {
  status: 'success';
  disenchanted: number;
  diamondGranted: number;
  groups: Array<{ name: string; count: number; diamondGranted: number }>;
};

/** 클라이언트 시뮬레이션 — 서버 planBulkDisenchant와 동일 알고리즘. 낙관적 UI. */
function clientSimulate(items: InvItem[]): Preview {
  const groups = new Map<number, InvItem[]>();
  for (const it of items) {
    if (!groups.has(it.catalogItemId)) groups.set(it.catalogItemId, []);
    groups.get(it.catalogItemId)!.push(it);
  }
  const rows: PreviewRow[] = [];
  for (const [catalogItemId, list] of groups) {
    list.sort(
      (a, b) =>
        b.transcendLevel - a.transcendLevel ||
        b.enhanceLevel - a.enhanceLevel ||
        a.id.localeCompare(b.id),
    );
    const candidates = list
      .slice(1)
      .filter((f) => !f.isLocked && !f.equipped && !f.busy);
    if (candidates.length === 0) continue;
    const first = list[0]!;
    rows.push({
      catalogItemId,
      code: first.code,
      name: first.name,
      slot: first.slot,
      toDisenchantIds: candidates.map((c) => c.id),
      count: candidates.length,
      diamondGranted: candidates.length * DIAMOND_PER_DISENCHANT,
    });
  }
  rows.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'ko'));
  const totalCount = rows.reduce((a, r) => a + r.count, 0);
  return { status: 'success', rows, totalCount, totalDiamond: totalCount * DIAMOND_PER_DISENCHANT };
}

export function BulkDisenchantModal({
  items,
  onClose,
  onDone,
}: {
  items: InvItem[];
  onClose: () => void;
  onDone: () => void;
}) {
  const initialPreview = useMemo(() => clientSimulate(items), [items]);
  const [phase, setPhase] = useState<'preview' | 'result' | 'error'>('preview');
  const [preview, setPreview] = useState<Preview>(initialPreview);
  const [result, setResult] = useState<ExecResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const { showRanking } = useResourceToast();

  const [confirm, setConfirm] = useState(false);
  const [confirmLeft, setConfirmLeft] = useState(0);

  const [selected, setSelected] = useState<Set<number>>(
    () => new Set(initialPreview.rows.map((r) => r.catalogItemId)),
  );
  useEffect(() => {
    setSelected(new Set(preview.rows.map((r) => r.catalogItemId)));
  }, [preview]);

  const selectedRows = preview.rows.filter((r) => selected.has(r.catalogItemId));
  const selectedTotalCount = selectedRows.reduce((a, r) => a + r.count, 0);
  const selectedTotalDiamond = selectedTotalCount * DIAMOND_PER_DISENCHANT;

  function toggle(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    if (confirm) setConfirm(false);
  }

  function toggleAll() {
    if (selected.size === preview.rows.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(preview.rows.map((r) => r.catalogItemId)));
    }
    if (confirm) setConfirm(false);
  }
  const allSelected = preview.rows.length > 0 && selected.size === preview.rows.length;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const r = await previewBulkDisenchantAction();
      if (cancelled) return;
      if (r.status === 'error') {
        setError(r.message);
        setPhase('error');
        return;
      }
      setPreview(r);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!confirm) return;
    if (confirmLeft <= 0) {
      setConfirm(false);
      return;
    }
    const t = setTimeout(() => setConfirmLeft((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [confirm, confirmLeft]);

  function tryExecute() {
    if (selectedRows.length === 0) return;
    if (!confirm) {
      setConfirm(true);
      setConfirmLeft(3);
      return;
    }
    setConfirm(false);
    execute();
  }

  function execute() {
    const optimistic: ExecResult = {
      status: 'success',
      disenchanted: selectedTotalCount,
      diamondGranted: selectedTotalDiamond,
      groups: selectedRows.map((r) => ({ name: r.name, count: r.count, diamondGranted: r.diamondGranted })),
    };
    setResult(optimistic);
    setPhase('result');
    const catalogIds = selectedRows.map((r) => r.catalogItemId);
    startTransition(async () => {
      const r = await bulkDisenchantAction(catalogIds);
      if (r.status === 'error') {
        setError(r.message);
        setPhase('error');
        return;
      }
      setResult(r);
      if ('ranksBefore' in r && 'ranksAfter' in r) {
        showRanking(r.ranksBefore, r.ranksAfter);
      }
    });
  }

  const headerText =
    phase === 'result' && result
      ? `총 ${result.disenchanted}개 분해 · 💎 ${result.diamondGranted.toLocaleString('ko-KR')}`
      : preview.rows.length === 0
        ? '분해 가능한 장비가 없습니다'
        : `${preview.rows.length}종 중 ${selectedRows.length}종 선택 · 💎 ${selectedTotalDiamond.toLocaleString('ko-KR')}`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[340px] rounded-2xl bg-zinc-950 p-4 text-zinc-100 shadow-[0_0_40px_rgba(16,185,129,0.18)] ring-1 ring-emerald-700/40"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-base font-bold">♻️ 일괄 분해</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-sm text-zinc-400 hover:text-zinc-200"
            aria-label="닫기"
          >
            ✕
          </button>
        </div>

        {phase === 'error' ? (
          <>
            <p className="py-6 text-center text-xs text-red-300">{error ?? '오류'}</p>
            <button
              type="button"
              onClick={onClose}
              className="w-full rounded-xl border border-zinc-700 py-2 text-xs text-zinc-200"
            >
              닫기
            </button>
          </>
        ) : (
          <>
            <div className="mb-2 flex min-h-[1.25rem] items-center justify-between text-xs text-zinc-300">
              <p>{headerText}</p>
              {phase === 'preview' && preview.rows.length > 0 ? (
                <button
                  type="button"
                  onClick={toggleAll}
                  className="rounded-full border border-zinc-700 px-2 py-0.5 text-[10px] text-zinc-300 hover:bg-zinc-800"
                >
                  {allSelected ? '전체 해제' : '전체 선택'}
                </button>
              ) : null}
            </div>

            <ul className="min-h-[80px] max-h-[40vh] space-y-1.5 overflow-y-auto">
              {phase === 'result' && result
                ? result.groups.map((g, i) => (
                    <li
                      key={`r-${i}`}
                      className="grid grid-cols-[1fr_auto] items-center gap-2 rounded-lg bg-white/5 px-3 py-2 text-[11px]"
                    >
                      <div className="truncate font-semibold">
                        {g.name} <span className="text-zinc-400">× {g.count}</span>
                      </div>
                      <div className="shrink-0 text-right font-mono text-emerald-300">
                        💎 {g.diamondGranted.toLocaleString('ko-KR')}
                      </div>
                    </li>
                  ))
                : preview.rows.map((r) => {
                    const checked = selected.has(r.catalogItemId);
                    return (
                      <li
                        key={`p-${r.catalogItemId}`}
                        className={`grid cursor-pointer grid-cols-[auto_1fr_auto] items-center gap-2 rounded-lg px-3 py-2 text-[11px] ${
                          checked ? 'bg-white/5' : 'bg-white/[0.02] opacity-60'
                        }`}
                        onClick={() => toggle(r.catalogItemId)}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          readOnly
                          aria-label={`${r.name} 선택`}
                          className="h-3.5 w-3.5 cursor-pointer accent-emerald-500"
                          onClick={(e) => e.stopPropagation()}
                          onChange={() => toggle(r.catalogItemId)}
                        />
                        <div className="min-w-0">
                          <div className="truncate font-semibold">{r.name}</div>
                          <div className="min-h-[0.85rem] text-[10px] text-zinc-400">
                            {r.count}개 분해 (가장 강한 1개 보존)
                          </div>
                        </div>
                        <div className="shrink-0 text-right font-mono text-emerald-300">
                          💎 {r.diamondGranted.toLocaleString('ko-KR')}
                        </div>
                      </li>
                    );
                  })}
            </ul>

            <div className="mt-2 min-h-[0.85rem] text-[10px] text-zinc-500">
              {phase === 'preview' && preview.rows.length > 0
                ? `잠금·장착·강화중 개체는 자동 제외 (개당 💎${DIAMOND_PER_DISENCHANT})`
                : ''}
            </div>

            <div className="mt-3 flex gap-2">
              {phase === 'result' ? (
                <button
                  type="button"
                  onClick={onDone}
                  className="flex-1 rounded-xl bg-emerald-500 py-2 text-xs font-bold text-zinc-950"
                >
                  확인
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={onClose}
                    className="flex-1 rounded-xl border border-zinc-700 py-2 text-xs text-zinc-200"
                  >
                    취소
                  </button>
                  <button
                    type="button"
                    onClick={tryExecute}
                    disabled={selectedRows.length === 0}
                    className="relative flex-[2] overflow-hidden rounded-xl border border-emerald-500 bg-emerald-500 py-2 text-xs font-bold tabular-nums text-zinc-950 disabled:opacity-40"
                  >
                    {confirm ? (
                      <span
                        aria-hidden
                        className="absolute inset-0 bg-emerald-400"
                        style={{ animation: 'confirm-bg-pulse 1.2s ease-in-out infinite' }}
                      />
                    ) : null}
                    <span className="relative">
                      {confirm
                        ? `정말 분해하시겠어요? (${confirmLeft})`
                        : `분해하기 (${selectedTotalCount}개)`}
                    </span>
                  </button>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
