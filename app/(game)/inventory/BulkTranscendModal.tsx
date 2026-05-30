'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';

import { transcendStyle } from '@/lib/game/equipment/transcend';
import { transcendFodderForStep } from '@/lib/game/balance';

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
  targetInstanceId: string;
  currentT: number;
  maxT: number;
  fodderToConsume: number;
  fodderAvailable: number;
  totalCountInGroup: number;
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
    const fodderCandidates = list
      .slice(1)
      .filter((f) => !f.isLocked && !f.equipped && !f.busy);
    let used = 0;
    let maxT = target.transcendLevel;
    for (let step = target.transcendLevel + 1; ; step++) {
      const need = transcendFodderForStep(step);
      if (used + need > fodderCandidates.length) break;
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
      targetInstanceId: target.id,
      currentT: target.transcendLevel,
      maxT,
      fodderToConsume: used,
      fodderAvailable: fodderCandidates.length,
      totalCountInGroup: list.length,
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
  onDone: () => void;
}) {
  // 낙관적 UI — 클라이언트 시뮬레이션으로 즉시 채움. 서버 preview 응답으로 검증/갱신.
  const initialPreview = useMemo(() => clientSimulate(items), [items]);
  const [phase, setPhase] = useState<'preview' | 'result' | 'error'>('preview');
  const [preview, setPreview] = useState<Preview>(initialPreview);
  const [result, setResult] = useState<ExecResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  // 강화 패턴 — 3s 확정 카운트다운.
  const [confirm, setConfirm] = useState(false);
  const [confirmLeft, setConfirmLeft] = useState(0);

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
    if (!preview || preview.rows.length === 0) return;
    if (!confirm) {
      setConfirm(true);
      setConfirmLeft(3);
      return;
    }
    setConfirm(false);
    execute();
  }

  function execute() {
    // 낙관적 — preview를 그대로 결과로 표시. 백그라운드에서 실제 실행 후 갱신.
    const optimistic: ExecResult = {
      status: 'success',
      stepsApplied: preview.rows.reduce((a, r) => a + (r.maxT - r.currentT), 0),
      targetsUpgraded: preview.rows.length,
      failedSteps: 0,
      skippedLockedTarget: preview.skippedLockedTarget,
      skippedNoUpgrade: preview.skippedNoUpgrade,
      upgraded: preview.rows.map((r) => ({ name: r.name, fromT: r.currentT, toT: r.maxT })),
    };
    setResult(optimistic);
    setPhase('result');
    startTransition(async () => {
      const r = await bulkTranscendAction();
      if (r.status === 'error') {
        setError(r.message);
        setPhase('error');
        return;
      }
      setResult(r);
    });
  }

  // 공유 UI 레이아웃 — 상단 헤더 1줄 + ul + 하단 버튼. preview/result 동일 시프트 없음.
  const headerText =
    phase === 'result' && result
      ? `총 ${result.targetsUpgraded}개 장비 ${result.stepsApplied}단계 초월 완료`
      : preview.rows.length === 0
        ? '초월 가능한 장비가 없습니다'
        : `${preview.rows.length}개 장비 초월 가능`;

  const listItems =
    phase === 'result' && result
      ? result.upgraded.map((u, i) => ({
          key: `r-${i}`,
          name: u.name,
          sub: '', // 결과는 제물 정보 자리에 빈 자리 유지(시프트 방지).
          fromT: u.fromT,
          toT: u.toT,
        }))
      : preview.rows.map((r) => ({
          key: `p-${r.catalogItemId}`,
          name: r.name,
          sub: `제물 ${r.fodderToConsume}개`,
          fromT: r.currentT,
          toT: r.maxT,
        }));

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[340px] rounded-2xl bg-zinc-950 p-4 text-zinc-100"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-base font-bold">✦ 일괄 초월</h2>
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
            <p className="mb-2 min-h-[1.25rem] text-xs text-zinc-300">
              {phase === 'result' && result ? (
                <>
                  총 <span className="font-bold text-amber-300">{result.targetsUpgraded}</span>개
                  장비{' '}
                  <span className="font-bold text-amber-300">{result.stepsApplied}</span>단계 초월
                  완료
                  {result.failedSteps > 0 ? ` · 중도 실패 ${result.failedSteps}회` : ''}
                </>
              ) : (
                headerText
              )}
            </p>

            <ul className="min-h-[80px] max-h-[40vh] space-y-1.5 overflow-y-auto">
              {listItems.map((it) => (
                <li
                  key={it.key}
                  className="grid grid-cols-[1fr_auto] items-center gap-2 rounded-lg bg-white/5 px-3 py-2 text-[11px]"
                >
                  <div className="min-w-0">
                    <div className="truncate font-semibold">{it.name}</div>
                    <div className="min-h-[0.85rem] text-[10px] text-zinc-400">{it.sub}</div>
                  </div>
                  <div className="shrink-0 text-right font-mono">
                    <span style={tierColorStyle(it.fromT)}>T{it.fromT}</span>
                    <span className="mx-1 text-zinc-500">→</span>
                    <span style={tierColorStyle(it.toT)}>T{it.toT}</span>
                    <span className="ml-1 text-[10px] text-zinc-400">
                      (+{it.toT - it.fromT})
                    </span>
                  </div>
                </li>
              ))}
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
                  onClick={onDone}
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
                    disabled={preview.rows.length === 0}
                    className="flex-[2] rounded-xl bg-amber-500 py-2 text-xs font-bold text-zinc-950 disabled:opacity-40"
                  >
                    {confirm
                      ? `확정? (${confirmLeft})`
                      : `초월하기 (${preview.rows.length}개)`}
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
