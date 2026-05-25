'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import { publishNoticeAction } from './actions';

export function NoticeForm() {
  const router = useRouter();
  const [message, setMessage] = useState('');
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);

  function submit() {
    const trimmed = message.trim();
    if (trimmed.length === 0 || trimmed.length > 280) {
      setResult({ ok: false, msg: '1~280자 사이로 입력해 주세요.' });
      return;
    }
    startTransition(async () => {
      const r = await publishNoticeAction(trimmed);
      if (r.ok) {
        setResult({ ok: true, msg: '적재 완료 — 세계역사 노출' });
        setMessage('');
        router.refresh();
      } else {
        setResult({ ok: false, msg: r.message ?? '실패' });
      }
    });
  }

  return (
    <div className="space-y-2">
      <textarea
        value={message}
        onChange={(e) => {
          setMessage(e.target.value);
          setResult(null);
        }}
        maxLength={280}
        rows={3}
        placeholder="예: 새로운 보스가 깨어났다. **타락천사**의 첫 등장이다."
        className="w-full rounded-md border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700"
      />
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-zinc-500 tabular-nums">{message.length} / 280</span>
        <button
          type="button"
          onClick={submit}
          disabled={pending || message.trim().length === 0}
          className="rounded-md bg-amber-600 px-3 py-1.5 text-[12px] font-bold text-white disabled:opacity-50"
        >
          {pending ? '적재 중…' : '세계역사에 적재'}
        </button>
      </div>
      {result ? (
        <p
          className={`rounded px-2.5 py-1.5 text-[11px] ${result.ok ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300' : 'bg-red-50 text-red-700 dark:bg-red-950/60 dark:text-red-300'}`}
        >
          {result.msg}
        </p>
      ) : null}
    </div>
  );
}
