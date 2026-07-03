'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import { deleteInquiryAction } from './actions';

/** 문의 삭제 버튼 — 답변 없이 종결(스팸·테스트·중복). confirm 후 하드 삭제. */
export function AdminSupportDelete({ inquiryId }: { inquiryId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  const onDelete = () => {
    if (!confirm('이 문의를 삭제할까요? 답변 없이 종결되며 되돌릴 수 없습니다.')) return;
    setErr(null);
    start(async () => {
      const r = await deleteInquiryAction(inquiryId);
      if (!r.ok) setErr(r.msg ?? '삭제 실패');
      else router.refresh();
    });
  };

  return (
    <span className="inline-flex items-center gap-1.5">
      <button
        type="button"
        onClick={onDelete}
        disabled={pending}
        className="rounded border border-red-900/60 px-1.5 py-0.5 text-[10px] font-bold text-red-400 hover:bg-red-950/40 disabled:opacity-50"
      >
        {pending ? '삭제 중…' : '삭제'}
      </button>
      {err ? <span className="text-[10px] text-red-500">{err}</span> : null}
    </span>
  );
}
