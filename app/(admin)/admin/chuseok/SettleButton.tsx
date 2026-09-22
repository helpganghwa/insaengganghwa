'use client';

import { useState, useTransition } from 'react';

import { settleChuseokAction, type SettleState } from './actions';

/** 정산·지급 버튼 — 두 번 눌러 확정(3초 재확인). 서버 쪽이 멱등이라 재클릭해도 중복 지급은 없다. */
export function SettleButton({ serverId, disabled }: { serverId: number; disabled: boolean }) {
  const [armed, setArmed] = useState(false);
  const [res, setRes] = useState<SettleState | null>(null);
  const [pending, start] = useTransition();
  const click = () => {
    if (!armed) {
      setArmed(true);
      setTimeout(() => setArmed(false), 3000);
      return;
    }
    setArmed(false);
    start(async () => {
      const r = await settleChuseokAction(serverId).catch(() => ({ ok: false as const, message: '요청 실패' }));
      setRes(r);
    });
  };
  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={click}
        disabled={disabled || pending}
        className={`rounded-lg px-3 py-1.5 text-[12px] font-bold text-white disabled:opacity-40 ${armed ? 'bg-red-600' : 'bg-amber-600'}`}
      >
        {pending ? '정산 중…' : armed ? '한 번 더 누르면 지급' : disabled ? '마감 뒤 정산 가능' : '정산·지급'}
      </button>
      {res ? (
        <span className={`text-[11px] ${res.ok ? 'text-emerald-600' : 'text-red-500'}`}>
          {res.ok ? (res.already ? `이미 정산됨(${res.rows}행)` : `확정 ${res.rows}행 · 우편 ${res.mails} · 칭호 ${res.titles}`) : res.message}
        </span>
      ) : null}
    </div>
  );
}
