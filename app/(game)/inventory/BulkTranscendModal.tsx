'use client';

import { useEffect, useState, useTransition } from 'react';

import { bulkTranscendAction, previewBulkTranscendAction } from './actions';

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
  const [phase, setPhase] = useState<'loading' | 'preview' | 'executing' | 'result' | 'error'>(
    'loading',
  );
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
      setPhase('preview');
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function execute() {
    setPhase('executing');
    startTransition(async () => {
      const r = await bulkTranscendAction();
      if (r.status === 'error') {
        setError(r.message);
        setPhase('error');
        return;
      }
      setResult(r);
      setPhase('result');
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[390px] rounded-t-2xl bg-zinc-950 p-4 text-zinc-100 sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-base font-bold">✦ 일괄 초월</h2>
          <button
            type="button"
            onClick={phase === 'executing' ? undefined : onClose}
            className="text-sm text-zinc-400 hover:text-zinc-200 disabled:opacity-30"
            disabled={phase === 'executing'}
            aria-label="닫기"
          >
            ✕
          </button>
        </div>

        {phase === 'loading' ? (
          <p className="py-6 text-center text-xs text-zinc-400">계산 중…</p>
        ) : null}

        {phase === 'preview' && preview ? (
          <>
            {preview.rows.length === 0 ? (
              <p className="py-6 text-center text-xs text-zinc-400">
                현재 초월 가능한 장비가 없습니다.
                <br />
                같은 아이템을 더 모은 뒤 다시 시도해 주세요.
              </p>
            ) : (
              <>
                <p className="mb-2 text-[11px] text-zinc-400">
                  같은 카탈로그 아이템 중 가장 강한 1개를 target으로, 나머지를 제물로 사용해
                  가능한 최대까지 초월합니다.
                </p>
                <ul className="max-h-[40vh] space-y-1.5 overflow-y-auto">
                  {preview.rows.map((r) => (
                    <li
                      key={r.catalogItemId}
                      className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-2 text-[11px]"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-semibold">{r.name}</div>
                        <div className="text-[10px] text-zinc-400">
                          제물 {r.fodderToConsume}개 (가용 {r.fodderAvailable})
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="font-mono text-amber-300">
                          T{r.currentT} <span className="text-zinc-500">→</span> T{r.maxT}
                          <span className="ml-1 text-[10px] text-zinc-400">
                            (+{r.maxT - r.currentT})
                          </span>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
                <div className="mt-2 text-[10px] text-zinc-500">
                  {preview.skippedLockedTarget > 0 ? `잠긴 target 제외: ${preview.skippedLockedTarget}개 · ` : ''}
                  {preview.skippedNoUpgrade > 0 ? `제물 부족으로 미진행: ${preview.skippedNoUpgrade}개` : ''}
                </div>
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
                    className="flex-[2] rounded-xl bg-amber-500 py-2 text-xs font-bold text-zinc-950"
                  >
                    초월하기 (
                    {preview.rows.reduce((a, r) => a + (r.maxT - r.currentT), 0)}단계)
                  </button>
                </div>
              </>
            )}
          </>
        ) : null}

        {phase === 'executing' ? (
          <p className="py-6 text-center text-xs text-zinc-400">초월 중…</p>
        ) : null}

        {phase === 'result' && result ? (
          <>
            <p className="mb-2 text-xs text-zinc-300">
              총 <span className="font-bold text-amber-300">{result.stepsApplied}</span>단계 초월
              완료 · 대상 {result.targetsUpgraded}개
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
                    <span className="font-mono text-amber-300">
                      T{u.fromT} <span className="text-zinc-500">→</span> T{u.toT}
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
