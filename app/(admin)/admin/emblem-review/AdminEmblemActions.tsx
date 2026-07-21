'use client';

import { useState, useTransition } from 'react';

import { adminRefundEmblemEscrow, adminRemoveEmblem } from './actions';

/** 문양 제거 버튼 — 2탭 컨펌(아바타 검수와 동일 정책: 실수 방지). */
export function RemoveEmblemButton({ emblemId }: { emblemId: string }) {
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
            const r = await adminRemoveEmblem(emblemId).catch(() => ({ ok: false, msg: '전송 실패' }));
            if (!r.ok) setMsg(r.msg ?? '실패');
          });
        }}
        className={`rounded-md px-2 py-1 text-[11px] font-bold text-white disabled:opacity-50 ${
          confirm ? 'animate-pulse bg-red-500' : 'bg-red-700'
        }`}
      >
        {pending ? '처리중…' : confirm ? '다시 눌러 확정' : '문양 제거'}
      </button>
      {msg ? <span className="text-[10px] text-red-400">{msg}</span> : null}
    </span>
  );
}

/** 유료 예치 환불 버튼 — completed만 노출(서버에서 조건부 전이로 이중 환불 차단). */
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
