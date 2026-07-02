'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import { answerInquiryAction } from './actions';

/** 관리자 답변 입력 — 우편 + 앱 알림으로 발송. */
export function AdminSupportAnswer({ inquiryId }: { inquiryId: string }) {
  const router = useRouter();
  const [answer, setAnswer] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const send = () => {
    if (answer.trim().length < 2 || pending) return;
    setErr(null);
    start(async () => {
      const r = await answerInquiryAction(inquiryId, answer);
      if (!r.ok) return setErr(r.msg ?? '실패했습니다.');
      router.refresh();
    });
  };

  return (
    <div className="mt-2">
      <textarea
        value={answer}
        onChange={(e) => setAnswer(e.target.value)}
        rows={3}
        placeholder="답변을 작성하세요 — 유저 우편함 + 앱 알림으로 발송됩니다."
        className="w-full resize-none rounded-lg border border-zinc-300 bg-white px-2.5 py-2 text-base outline-none focus:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-900"
      />
      {err ? <p className="mt-1 text-[11px] font-semibold text-red-500">{err}</p> : null}
      <button
        type="button"
        onClick={send}
        disabled={pending || answer.trim().length < 2}
        className="mt-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-[13px] font-bold text-white active:opacity-90 disabled:opacity-40"
      >
        {pending ? '발송 중…' : '답변 보내기 (우편 + 알림)'}
      </button>
    </div>
  );
}
