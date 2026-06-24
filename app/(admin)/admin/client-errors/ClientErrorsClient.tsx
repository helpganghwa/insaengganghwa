'use client';

import { useState, useTransition } from 'react';

import { resolveClientErrorAction } from './actions';

export type ErrRow = {
  id: string;
  kind: string;
  message: string;
  url: string | null;
  ua: string | null;
  stack: string | null;
  count: number;
  resolved: boolean;
  firstSeen: string;
  lastSeen: string;
};

function fmt(iso: string): string {
  return new Date(iso).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', hour12: false });
}

function Row({ e }: { e: ErrRow }) {
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-3">
      <div className="flex items-center gap-2">
        <span className="shrink-0 rounded border border-zinc-600 bg-zinc-800 px-1.5 py-0.5 text-[10px] font-bold text-zinc-300">
          {e.kind}
        </span>
        {e.count > 1 && (
          <span className="shrink-0 rounded-full bg-red-600 px-1.5 text-[10px] font-bold text-white">
            ×{e.count}
          </span>
        )}
        <span className="ml-auto text-[11px] text-zinc-500">{fmt(e.lastSeen)}</span>
      </div>
      <p className="mt-1.5 break-words text-xs font-semibold text-zinc-200">{e.message}</p>
      {e.url && <p className="mt-0.5 break-all font-mono text-[10px] text-zinc-500">{e.url}</p>}
      {e.stack && (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="mt-1 text-[11px] text-zinc-500 underline"
        >
          {open ? '스택 숨기기' : '스택 보기'}
        </button>
      )}
      {open && e.stack && (
        <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded bg-zinc-950/70 p-2 text-[10px] text-zinc-400">
          {e.stack}
          {e.ua ? `\n\nUA: ${e.ua}` : ''}
        </pre>
      )}
      {!e.resolved && (
        <button
          type="button"
          disabled={pending}
          onClick={() => start(() => resolveClientErrorAction(e.id).then(() => {}))}
          className="mt-2 rounded-lg border border-zinc-700 px-3 py-1.5 text-xs font-semibold text-zinc-300 disabled:opacity-50"
        >
          {pending ? '처리 중…' : '해결 처리'}
        </button>
      )}
    </div>
  );
}

export function ClientErrorsClient({ open, resolved }: { open: ErrRow[]; resolved: ErrRow[] }) {
  return (
    <div className="space-y-5">
      <section className="space-y-2">
        {open.length === 0 ? (
          <div className="rounded-xl border border-emerald-800/40 bg-emerald-900/10 p-4 text-center text-sm text-emerald-300">
            미해결 에러 없음 ✓
          </div>
        ) : (
          open.map((e) => <Row key={e.id} e={e} />)
        )}
      </section>
      {resolved.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-xs font-semibold text-zinc-500">최근 해결됨</h2>
          {resolved.map((e) => (
            <Row key={e.id} e={e} />
          ))}
        </section>
      )}
    </div>
  );
}
