'use client';

import { useEffect, useState, useTransition } from 'react';

import { transcendStyle } from '@/lib/game/equipment/transcend';

import { bulkTranscendAction, previewBulkTranscendAction } from './actions';

/** T 색상 — 초월 등급별 색상(T0=neutral, T1+=tier). */
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

export function BulkTranscendModal({
  onClose,
  onDone,
}: {
  onClose: () => void;
  onDone: () => void;
}) {
  // loading/executing phase 제거 → preview 비어있으면 빈 ul, execute는 낙관적 UI로 즉시 result.
  const [phase, setPhase] = useState<'preview' | 'result' | 'error'>('preview');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [result, setResult] = useState<ExecResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

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

  function execute() {
    if (!preview) return;
    // 낙관적 UI — preview 그대로 결과 표시. 백그라운드에서 실제 실행 후 응답으로 갱신.
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

        {phase === 'preview' ? (
          preview && preview.rows.length === 0 ? (
            <p className="py-6 text-center text-xs text-zinc-400">
              현재 초월 가능한 장비가 없습니다.
              <br />
              같은 아이템을 더 모은 뒤 다시 시도해 주세요.
            </p>
          ) : (
            <>
              <ul className="max-h-[40vh] space-y-1.5 overflow-y-auto">
                {(preview?.rows ?? []).map((r) => (
                  <li
                    key={r.catalogItemId}
                    className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-2 text-[11px]"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-semibold">{r.name}</div>
                      <div className="text-[10px] text-zinc-400">제물 {r.fodderToConsume}개</div>
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
                ))}
              </ul>
              {preview && preview.skippedLockedTarget > 0 ? (
                <div className="mt-2 text-[10px] text-zinc-500">
                  잠긴 target 제외: {preview.skippedLockedTarget}개
                </div>
              ) : null}
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 rounded-xl border border-zinc-700 py-2 text-xs text-zinc-200"
                >
                  취소
                </button>
                <button
                  type="button"
                  onClick={execute}
                  disabled={!preview || preview.rows.length === 0}
                  className="flex-[2] rounded-xl bg-amber-500 py-2 text-xs font-bold text-zinc-950 disabled:opacity-40"
                >
                  초월하기 ({preview?.rows.length ?? 0}개)
                </button>
              </div>
            </>
          )
        ) : null}

        {phase === 'result' && result ? (
          <>
            <p className="mb-2 text-xs text-zinc-300">
              총 <span className="font-bold text-amber-300">{result.targetsUpgraded}</span>개 장비{' '}
              <span className="font-bold text-amber-300">{result.stepsApplied}</span>단계 초월
              완료
              {result.failedSteps > 0 ? ` · 중도 실패 ${result.failedSteps}회` : ''}
            </p>
            {result.upgraded.length > 0 ? (
              <ul className="max-h-[40vh] space-y-1.5 overflow-y-auto">
                {result.upgraded.map((u, i) => (
                  <li
                    key={i}
                    className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-2 text-[11px]"
                  >
                    <span className="truncate font-semibold">{u.name}</span>
                    <span className="font-mono">
                      <span style={tierColorStyle(u.fromT)}>T{u.fromT}</span>
                      <span className="mx-1 text-zinc-500">→</span>
                      <span style={tierColorStyle(u.toT)}>T{u.toT}</span>
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
            <button
              type="button"
              onClick={onDone}
              className="mt-3 w-full rounded-xl bg-amber-500 py-2 text-xs font-bold text-zinc-950"
            >
              확인
            </button>
          </>
        ) : null}

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
        ) : null}
      </div>
    </div>
  );
}
