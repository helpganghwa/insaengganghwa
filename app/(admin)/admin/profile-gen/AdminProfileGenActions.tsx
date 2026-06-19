'use client';

import { useState, useTransition } from 'react';

import { adminConfirmReview, adminGrantAvatar, adminRevokeAndRefund } from './actions';

const DECISION_KO: Record<string, string> = {
  confirm: '✓ 확인(무조치)',
  grant: '🎁 아바타 지급',
  reject: '↩ 회수+환불',
};

export function AdminProfileGenActions({
  jobId,
  hasAvatar,
  canGrant,
  escrow,
  decision,
}: {
  jobId: string;
  hasAvatar: boolean;
  /** AI 거절(실패) 건이라 운영자가 아바타를 지급할 수 있는 상태. 통과 건엔 false. */
  canGrant: boolean;
  escrow: string;
  decision: string | null;
}) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState('');

  const run = (fn: () => Promise<{ ok: boolean; msg?: string }>, confirmText: string) => {
    if (!confirm(confirmText)) return;
    start(async () => {
      const r = await fn();
      setMsg(r.ok ? '✓ 완료' : `✗ ${r.msg ?? '실패'}`);
    });
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {decision && (
        <span className="rounded-full bg-zinc-800 px-2 py-1 text-[11px] text-zinc-300">
          검수됨: {DECISION_KO[decision] ?? decision}
        </span>
      )}
      <button
        type="button"
        disabled={pending}
        onClick={() => run(() => adminConfirmReview(jobId), '이 건을 확인 처리할까요? (AI 결정 인정·무조치)')}
        className="rounded-lg border border-zinc-600 bg-zinc-800/60 px-3 py-1.5 text-xs font-bold text-zinc-200 disabled:opacity-50"
      >
        확인(무조치)
      </button>
      {hasAvatar ? (
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            run(
              () => adminRevokeAndRefund(jobId),
              `이 아바타를 회수하고 다이아 ${escrow}개를 환불할까요?\n(유저 컬렉션에서 삭제 + 환불 + 우편 통지)`,
            )
          }
          className="rounded-lg border border-red-700 bg-red-900/30 px-3 py-1.5 text-xs font-bold text-red-300 disabled:opacity-50"
        >
          리젝(회수+환불)
        </button>
      ) : canGrant ? (
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            run(
              () => adminGrantAvatar(jobId),
              '이 아바타를 지급할까요?\n(AI 거절 건 — 문제 없음 판정 시 다이아 차감 없이 목록 추가 + 우편 통지)',
            )
          }
          className="rounded-lg border border-emerald-700 bg-emerald-900/30 px-3 py-1.5 text-xs font-bold text-emerald-300 disabled:opacity-50"
        >
          아바타 지급(차감X)
        </button>
      ) : (
        <span className="text-[11px] text-zinc-500">표시할 아바타 없음 (유저 삭제 또는 회수됨)</span>
      )}
      {msg && <span className="text-xs text-zinc-400">{msg}</span>}
    </div>
  );
}
