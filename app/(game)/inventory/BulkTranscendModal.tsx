'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';

import { useResourceToast } from '@/components/ResourceToast';
import { TranscendSprite } from '@/components/TranscendSprite';
import { transcendStyle } from '@/lib/game/equipment/transcend';
import { transcendFodderForStep } from '@/lib/game/balance';
import type { Slot } from '@/lib/db/schema/equipment';

import { bulkTranscendAction, previewBulkTranscendAction } from './actions';
import type { InvItem } from './InventoryGrid';

function tierColorStyle(level: number) {
  const [r, g, b] = transcendStyle(level).colorRgb;
  return { color: `rgb(${r},${g},${b})` };
}

type PreviewRow = {
  catalogItemId: number;
  code: string;
  name: string;
  slot: Slot;
  targetInstanceId: string;
  currentT: number;
  maxT: number;
  fodderToConsume: number;
  fodderAvailable: number;
  totalCountInGroup: number;
  /** 약한 순 정렬로 잡힌 fodder instance ids — 낙관적 UI에서 인벤토리 갱신용. */
  consumedFodderIds: string[];
};
/** 일괄 초월 완료 시 부모(InventoryGrid)에게 전달할 낙관 업데이트 payload. */
export type BulkTranscendOptimistic = {
  upgrades: Array<{
    targetInstanceId: string;
    toT: number;
    consumedFodderIds: string[];
  }>;
};
type Preview = {
  status: 'success';
  rows: PreviewRow[];
  skippedLockedTarget: number;
  skippedNoUpgrade: number;
};
type ExecResult = {
  status: 'success';
  stepsApplied: number;
  targetsUpgraded: number;
  failedSteps: number;
  skippedLockedTarget: number;
  skippedNoUpgrade: number;
  upgraded: Array<{ name: string; fromT: number; toT: number }>;
};

/** 클라이언트 시뮬레이션 — 서버 planBulkTranscend와 동일 알고리즘.
 *  낙관적 UI: 모달 열림 즉시 표시. 서버 preview 응답으로 갱신. */
function clientSimulate(items: InvItem[]): Preview {
  const groups = new Map<number, InvItem[]>();
  for (const it of items) {
    if (!groups.has(it.catalogItemId)) groups.set(it.catalogItemId, []);
    groups.get(it.catalogItemId)!.push(it);
  }
  const rows: PreviewRow[] = [];
  let skippedLockedTarget = 0;
  let skippedNoUpgrade = 0;
  for (const [catalogItemId, list] of groups) {
    list.sort(
      (a, b) =>
        b.transcendLevel - a.transcendLevel ||
        b.enhanceLevel - a.enhanceLevel ||
        a.id.localeCompare(b.id),
    );
    const target = list[0]!;
    if (target.isLocked) {
      skippedLockedTarget++;
      continue;
    }
    // 서버 performTranscend가 fodder를 약한 순으로 선택하므로 시뮬레이션도 같은 정렬.
    const fodderCandidates = list
      .slice(1)
      .filter((f) => !f.isLocked && !f.equipped && !f.busy)
      .sort(
        (a, b) =>
          a.transcendLevel - b.transcendLevel ||
          a.enhanceLevel - b.enhanceLevel ||
          a.id.localeCompare(b.id),
      );
    let used = 0;
    let maxT = target.transcendLevel;
    const consumedFodderIds: string[] = [];
    for (let step = target.transcendLevel + 1; ; step++) {
      const need = transcendFodderForStep(step);
      if (used + need > fodderCandidates.length) break;
      for (let i = used; i < used + need; i++) {
        consumedFodderIds.push(fodderCandidates[i]!.id);
      }
      used += need;
      maxT = step;
    }
    if (maxT === target.transcendLevel) {
      skippedNoUpgrade++;
      continue;
    }
    rows.push({
      catalogItemId,
      code: target.code,
      name: target.name,
      slot: target.slot,
      targetInstanceId: target.id,
      currentT: target.transcendLevel,
      maxT,
      fodderToConsume: used,
      fodderAvailable: fodderCandidates.length,
      totalCountInGroup: list.length,
      consumedFodderIds,
    });
  }
  rows.sort(
    (a, b) => b.maxT - b.currentT - (a.maxT - a.currentT) || a.name.localeCompare(b.name, 'ko'),
  );
  return { status: 'success', rows, skippedLockedTarget, skippedNoUpgrade };
}

export function BulkTranscendModal({
  items,
  onClose,
  onDone,
}: {
  items: InvItem[];
  onClose: () => void;
  /** payload 있으면 InventoryGrid에 낙관 업데이트 적용 후 refresh. */
  onDone: (payload?: BulkTranscendOptimistic) => void;
}) {
  // 낙관적 UI — 클라이언트 시뮬레이션으로 즉시 채움. 서버 preview 응답으로 검증/갱신.
  const initialPreview = useMemo(() => clientSimulate(items), [items]);
  const [phase, setPhase] = useState<'preview' | 'result' | 'error'>('preview');
  const [preview, setPreview] = useState<Preview>(initialPreview);
  const [result, setResult] = useState<ExecResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  // onDone에 전달할 낙관 업데이트 payload — execute 시점에 selectedRows로 캡처.
  const [optimisticPayload, setOptimisticPayload] = useState<BulkTranscendOptimistic | null>(null);
  const [, startTransition] = useTransition();
  const { showRanking } = useResourceToast();

  // 강화 패턴 — 3s 확정 카운트다운.
  const [confirm, setConfirm] = useState(false);
  const [confirmLeft, setConfirmLeft] = useState(0);

  // 선택 — preview가 갱신될 때마다 항상 전체 선택으로 리셋.
  // (서버 응답이 initialPreview와 다른 row를 포함하는 경우 일부만 선택되는 문제 회피)
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(initialPreview.rows.map((r) => r.targetInstanceId)),
  );
  useEffect(() => {
    setSelected(new Set(preview.rows.map((r) => r.targetInstanceId)));
  }, [preview]);

  const selectedRows = preview.rows.filter((r) => selected.has(r.targetInstanceId));

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    // 선택 변경 시 confirm 해제.
    if (confirm) setConfirm(false);
  }

  function toggleAll() {
    if (selected.size === preview.rows.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(preview.rows.map((r) => r.targetInstanceId)));
    }
    if (confirm) setConfirm(false);
  }
  const allSelected =
    preview.rows.length > 0 && selected.size === preview.rows.length;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const r = await previewBulkTranscendAction();
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
    // 낙관적 — 선택된 row를 결과로 표시. 백그라운드에서 실제 실행 후 갱신.
    const optimistic: ExecResult = {
      status: 'success',
      stepsApplied: selectedRows.reduce((a, r) => a + (r.maxT - r.currentT), 0),
      targetsUpgraded: selectedRows.length,
      failedSteps: 0,
      skippedLockedTarget: preview.skippedLockedTarget,
      skippedNoUpgrade: preview.skippedNoUpgrade,
      upgraded: selectedRows.map((r) => ({ name: r.name, fromT: r.currentT, toT: r.maxT })),
    };
    setResult(optimistic);
    setPhase('result');
    // 인벤토리 grid 낙관 업데이트용 payload 캡처(onDone 시점에 부모에게 전달).
    setOptimisticPayload({
      upgrades: selectedRows.map((r) => ({
        targetInstanceId: r.targetInstanceId,
        toT: r.maxT,
        consumedFodderIds: r.consumedFodderIds,
      })),
    });
    const ids = selectedRows.map((r) => r.targetInstanceId);
    startTransition(async () => {
      const r = await bulkTranscendAction(ids);
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

  // 공유 UI 레이아웃 — 상단 헤더 1줄 + ul + 하단 버튼. preview/result 동일 시프트 없음.
  const headerText =
    phase === 'result' && result
      ? `총 ${result.targetsUpgraded}개 장비 ${result.stepsApplied}단계 초월 완료`
      : preview.rows.length === 0
        ? '초월 가능한 장비가 없습니다'
        : `${preview.rows.length}개 중 ${selectedRows.length}개 선택`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[340px] rounded-2xl bg-zinc-950 p-4 text-zinc-100 shadow-[0_0_40px_rgba(245,158,11,0.18)] ring-1 ring-amber-700/40"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-base font-bold">일괄 초월</h2>
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
            {/* 헤더 — 상태와 무관하게 1줄 자리 유지(시프트 방지). */}
            <div className="mb-2 flex min-h-[1.25rem] items-center justify-between text-xs text-zinc-300">
              <p>
                {phase === 'result' && result ? (
                  <>
                    총{' '}
                    <span className="font-bold text-amber-300">{result.targetsUpgraded}</span>개
                    장비{' '}
                    <span className="font-bold text-amber-300">{result.stepsApplied}</span>단계
                    초월 완료
                    {result.failedSteps > 0 ? ` · 중도 실패 ${result.failedSteps}회` : ''}
                  </>
                ) : (
                  headerText
                )}
              </p>
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
                ? result.upgraded.map((u, i) => {
                    // 결과 row의 sprite는 preview row와 동일 카탈로그 매칭(이름 기준 fallback).
                    const matchRow = preview.rows.find((r) => r.name === u.name);
                    return (
                      <li
                        key={`r-${i}`}
                        className="grid grid-cols-[auto_1fr_auto] items-center gap-2 rounded-lg bg-white/5 px-3 py-2 text-[11px]"
                      >
                        {matchRow ? (
                          <TranscendSprite
                            code={matchRow.code}
                            slot={matchRow.slot}
                            level={u.toT}
                            isChampion={false}
                            size={28}
                            frameless
                          />
                        ) : (
                          <span className="block h-7 w-7" aria-hidden />
                        )}
                        <div className="truncate font-semibold">{u.name}</div>
                        <div className="shrink-0 text-right font-mono">
                          <span style={tierColorStyle(u.fromT)}>T{u.fromT}</span>
                          <span className="mx-1 text-zinc-500">→</span>
                          <span style={tierColorStyle(u.toT)}>T{u.toT}</span>
                          <span className="ml-1 text-[10px] text-zinc-400">
                            (+{u.toT - u.fromT})
                          </span>
                        </div>
                      </li>
                    );
                  })
                : preview.rows.map((r) => {
                    const checked = selected.has(r.targetInstanceId);
                    return (
                      <li
                        key={`p-${r.catalogItemId}`}
                        className={`grid cursor-pointer grid-cols-[auto_auto_1fr_auto] items-center gap-2 rounded-lg px-3 py-2 text-[11px] ${
                          checked ? 'bg-white/5' : 'bg-white/[0.02] opacity-60'
                        }`}
                        onClick={() => toggle(r.targetInstanceId)}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          readOnly
                          aria-label={`${r.name} 선택`}
                          className="h-3.5 w-3.5 cursor-pointer accent-amber-500"
                          onClick={(e) => e.stopPropagation()}
                          onChange={() => toggle(r.targetInstanceId)}
                        />
                        <TranscendSprite
                          code={r.code}
                          slot={r.slot}
                          level={r.currentT}
                          isChampion={false}
                          size={28}
                          frameless
                        />
                        <div className="min-w-0">
                          <div className="truncate font-semibold">{r.name}</div>
                          <div className="min-h-[0.85rem] text-[10px] text-zinc-400">
                            제물 {r.fodderToConsume}개
                          </div>
                        </div>
                        <div className="shrink-0 text-right font-mono">
                          <span style={tierColorStyle(r.currentT)}>T{r.currentT}</span>
                          <span className="mx-1 text-zinc-500">→</span>
                          <span style={tierColorStyle(r.maxT)}>T{r.maxT}</span>
                          <span className="ml-1 text-[10px] text-zinc-400">
                            (+{r.maxT - r.currentT})
                          </span>
                        </div>
                      </li>
                    );
                  })}
            </ul>

            {phase === 'preview' && preview.skippedLockedTarget > 0 ? (
              <div className="mt-2 text-[10px] text-zinc-500">
                잠긴 target 제외: {preview.skippedLockedTarget}개
              </div>
            ) : (
              <div className="mt-2 min-h-[0.85rem]" aria-hidden />
            )}

            <div className="mt-3 flex gap-2">
              {phase === 'result' ? (
                <button
                  type="button"
                  onClick={() => onDone(optimisticPayload ?? undefined)}
                  className="flex-1 rounded-xl bg-amber-500 py-2 text-xs font-bold text-zinc-950"
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
                    className="relative flex-[2] overflow-hidden rounded-xl border border-amber-500 bg-amber-500 py-2 text-xs font-bold tabular-nums text-zinc-950 disabled:opacity-40"
                  >
                    {/* 배경만 펄스(텍스트는 안정). */}
                    {confirm ? (
                      <span
                        aria-hidden
                        className="absolute inset-0 bg-amber-400"
                        style={{ animation: 'confirm-bg-pulse 1.2s ease-in-out infinite' }}
                      />
                    ) : null}
                    <span className="relative">
                      {confirm
                        ? `정말 초월하시겠어요? (${confirmLeft})`
                        : `초월하기 (${selectedRows.length}개)`}
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
