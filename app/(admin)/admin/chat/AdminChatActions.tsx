'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import { setChatHiddenAction, muteChatUserAction, setChatEnabledAction } from './actions';

/** 어드민 채팅 조작 버튼(0125) — 숨김/해제·채팅 금지·킬스위치. */

export function ChatToggle({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (!window.confirm(enabled ? '월드 채팅을 끌까요? (전 유저 즉시 차단)' : '월드 채팅을 켤까요?')) return;
        start(async () => {
          await setChatEnabledAction(!enabled);
          router.refresh();
        });
      }}
      className={`rounded-lg px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50 ${
        enabled ? 'bg-red-600' : 'bg-emerald-600'
      }`}
    >
      {enabled ? '채팅 끄기' : '채팅 켜기'}
    </button>
  );
}

export function MessageActions({ messageId, hidden, userId }: { messageId: string; hidden: boolean; userId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const run = (fn: () => Promise<{ status: string; message?: string }>) =>
    start(async () => {
      const r = await fn();
      setMsg(r.status === 'success' ? null : (r.message ?? '실패'));
      router.refresh();
    });
  return (
    <span className="flex items-center gap-1.5">
      <button
        type="button"
        disabled={pending}
        onClick={() => run(() => setChatHiddenAction(messageId, !hidden))}
        className="rounded bg-zinc-700 px-2 py-1 text-[10px] font-bold text-white disabled:opacity-50"
      >
        {hidden ? '해제' : '숨김'}
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (!window.confirm('이 유저를 7일간 채팅 금지할까요?')) return;
          run(() => muteChatUserAction(userId, 7));
        }}
        className="rounded bg-amber-700 px-2 py-1 text-[10px] font-bold text-white disabled:opacity-50"
      >
        금지 7d
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (!window.confirm('이 유저의 채팅 금지를 해제할까요?')) return;
          run(() => muteChatUserAction(userId, 0));
        }}
        className="rounded bg-zinc-500 px-2 py-1 text-[10px] font-bold text-white disabled:opacity-50"
      >
        금지 해제
      </button>
      {msg ? <span className="text-[10px] text-red-400">{msg}</span> : null}
    </span>
  );
}
