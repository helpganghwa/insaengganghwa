'use client';

import { useState, useTransition } from 'react';

import { adminConfirmEmblem, adminRefundEmblemEscrow, adminRejectEmblem } from './actions';

/** 검토 통과(무조치) + 리젝+환불 — 아바타 검수와 동일 결정 축. 리젝만 2탭 컨펌. */
export function EmblemDecisionButtons({ emblemId }: { emblemId: string }) {
  const [confirm, setConfirm] = useState(false);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <span className="inline-flex items-center gap-1.5">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await adminConfirmEmblem(emblemId).catch(() => ({ ok: false, msg: '전송 실패' }));
            if (!r.ok) setMsg(r.msg ?? '실패');
          })
        }
        className="rounded-md bg-zinc-700 px-2 py-1 text-[11px] font-bold text-white disabled:opacity-50"
      >
        검토 통과
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (!confirm) {
            setConfirm(true);
            setTimeout(() => setConfirm(false), 3000);
            return;
          }
          setConfirm(false);
          start(async () => {
            const r = await adminRejectEmblem(emblemId).catch(() => ({ ok: false, msg: '전송 실패' }));
            if (!r.ok) setMsg(r.msg ?? '실패');
          });
        }}
        className={`rounded-md px-2 py-1 text-[11px] font-bold text-white disabled:opacity-50 ${
          confirm ? 'animate-pulse bg-red-500' : 'bg-red-700'
        }`}
      >
        {pending ? '처리중…' : confirm ? '다시 눌러 확정' : '리젝+환불'}
      </button>
      {msg ? <span className="text-[10px] text-red-400">{msg}</span> : null}
    </span>
  );
}

/** 유료 예치 단독 환불(문양 유지) — completed만 노출, 서버 조건부 전이로 이중 환불 차단. */
export function RefundEscrowButton({ escrowId, amount }: { escrowId: string; amount: string }) {
  const [confirm, setConfirm] = useState(false);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <span className="inline-flex items-center gap-1.5">
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (!confirm) {
            setConfirm(true);
            setTimeout(() => setConfirm(false), 3000);
            return;
          }
          setConfirm(false);
          start(async () => {
            const r = await adminRefundEmblemEscrow(escrowId).catch(() => ({ ok: false, msg: '전송 실패' }));
            if (!r.ok) setMsg(r.msg ?? '실패');
          });
        }}
        className={`rounded-md px-2 py-1 text-[11px] font-bold text-white disabled:opacity-50 ${
          confirm ? 'animate-pulse bg-amber-500' : 'bg-amber-600'
        }`}
      >
        {pending ? '처리중…' : confirm ? '다시 눌러 확정' : `💎${amount} 환불`}
      </button>
      {msg ? <span className="text-[10px] text-red-400">{msg}</span> : null}
    </span>
  );
}
