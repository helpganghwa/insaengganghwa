'use client';

import { useState, useTransition } from 'react';

import { resolveAlertAction, retryAlertAction } from './actions';

export type AlertRow = {
  id: string;
  kind: string;
  severity: string;
  paymentId: string;
  orderId: string | null;
  detail: string;
  resolved: boolean;
  createdAt: string;
  resolvedAt: string | null;
};

const SEV_BADGE: Record<string, string> = {
  critical: 'bg-red-500/15 text-red-300 border-red-500/40',
  high: 'bg-orange-500/15 text-orange-300 border-orange-500/40',
  warn: 'bg-yellow-500/15 text-yellow-300 border-yellow-500/40',
};

const RETRYABLE = new Set(['PAID_NOT_GRANTED', 'COMPLETE_EXCEPTION', 'REFUND_RECLAIM_FAILED']);

function fmt(iso: string): string {
  // KST 표시(어드민 전용 — 간단 변환).
  return new Date(iso).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', hour12: false });
}

function Row({ a }: { a: AlertRow }) {
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const sev = SEV_BADGE[a.severity] ?? 'bg-zinc-700/40 text-zinc-300 border-zinc-600';

  const run = (fn: () => Promise<{ status: string; code?: string }>) =>
    startTransition(async () => {
      setMsg(null);
      const r = await fn();
      if (r.status !== 'success') setMsg(`실패: ${r.code ?? '알 수 없음'}`);
    });

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-3">
      <div className="flex items-center gap-2">
        <span className={`rounded border px-1.5 py-0.5 text-[10px] font-bold ${sev}`}>
          {a.severity}
        </span>
        <span className="font-mono text-sm font-bold text-zinc-200">{a.kind}</span>
        <span className="ml-auto text-[11px] text-zinc-500">{fmt(a.createdAt)}</span>
      </div>
      <p className="mt-1.5 text-xs leading-relaxed text-zinc-300">{a.detail}</p>
      {a.paymentId && (
        <p className="mt-1 break-all font-mono text-[10px] text-zinc-500">
          payment: {a.paymentId}
          {a.orderId ? ` · order #${a.orderId}` : ''}
        </p>
      )}
      {!a.resolved && (
        <div className="mt-2.5 flex items-center gap-2">
          {RETRYABLE.has(a.kind) && (
            <button
              type="button"
              disabled={pending}
              onClick={() => run(() => retryAlertAction(a.id))}
              className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50"
            >
              {pending ? '처리 중…' : '자동치유 재시도'}
            </button>
          )}
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => resolveAlertAction(a.id))}
            className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs font-semibold text-zinc-300 disabled:opacity-50"
          >
            해결 처리
          </button>
          {msg && <span className="text-[11px] text-red-400">{msg}</span>}
        </div>
      )}
      {a.resolved && a.resolvedAt && (
        <p className="mt-1.5 text-[11px] text-emerald-400/80">해결됨 · {fmt(a.resolvedAt)}</p>
      )}
    </div>
  );
}

export function AlertsClient({ open, resolved }: { open: AlertRow[]; resolved: AlertRow[] }) {
  return (
    <div className="space-y-5">
      <section className="space-y-2">
        {open.length === 0 ? (
          <div className="rounded-xl border border-emerald-800/40 bg-emerald-900/10 p-4 text-center text-sm text-emerald-300">
            미해결 사고 없음 ✓
          </div>
        ) : (
          open.map((a) => <Row key={a.id} a={a} />)
        )}
      </section>

      {resolved.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-xs font-semibold text-zinc-500">최근 해결됨</h2>
          {resolved.map((a) => (
            <Row key={a.id} a={a} />
          ))}
        </section>
      )}
    </div>
  );
}
