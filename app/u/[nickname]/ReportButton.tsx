'use client';

import { useState, useTransition } from 'react';

import { reportProfile } from './actions';

const REASONS: { value: string; label: string }[] = [
  { value: 'nsfw', label: '선정적·음란' },
  { value: 'violence', label: '폭력적·잔인' },
  { value: 'hate', label: '혐오·차별' },
  { value: 'impersonation', label: '사칭·도용' },
  { value: 'quality', label: '부적절·저품질' },
  { value: 'other', label: '기타' },
];

export function ReportButton({ profileId }: { profileId: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();

  const submit = () => {
    if (!reason) return;
    startTransition(async () => {
      const r = await reportProfile(profileId, reason, reason === 'other' ? note : undefined);
      if (r.status === 'error') {
        alert(r.message);
        return;
      }
      setDone(true);
    });
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-2 text-[11px] text-zinc-400 underline"
      >
        🚩 신고
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center"
          onClick={() => !pending && setOpen(false)}
        >
          <div
            className="w-full max-w-[390px] rounded-t-2xl bg-white p-4 text-left dark:bg-zinc-950 sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {done ? (
              <div className="py-6 text-center">
                <div className="text-2xl">✅</div>
                <p className="mt-2 text-sm font-semibold">신고가 접수되었습니다</p>
                <p className="mt-1 text-xs text-zinc-500">검토 후 조치됩니다. 감사합니다.</p>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="mt-4 w-full rounded-xl bg-zinc-200 py-3 text-sm font-medium dark:bg-zinc-800"
                >
                  닫기
                </button>
              </div>
            ) : (
              <>
                <div className="mb-3 text-sm font-bold">프로필 신고</div>
                <div className="space-y-1.5">
                  {REASONS.map((r) => (
                    <button
                      key={r.value}
                      type="button"
                      onClick={() => setReason(r.value)}
                      className={`flex w-full items-center justify-between rounded-xl border px-3 py-2.5 text-sm ${
                        reason === r.value
                          ? 'border-red-400 bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300'
                          : 'border-zinc-200 dark:border-zinc-800'
                      }`}
                    >
                      {r.label}
                      {reason === r.value && <span>✓</span>}
                    </button>
                  ))}
                </div>
                {reason === 'other' && (
                  <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    maxLength={200}
                    placeholder="사유를 간단히 적어주세요 (최대 200자)"
                    className="mt-2 w-full rounded-xl border border-zinc-200 p-2 text-sm dark:border-zinc-800 dark:bg-zinc-900"
                    rows={2}
                  />
                )}
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    disabled={pending}
                    className="flex-1 rounded-xl border border-zinc-200 py-3 text-sm dark:border-zinc-800"
                  >
                    취소
                  </button>
                  <button
                    type="button"
                    onClick={submit}
                    disabled={pending || !reason}
                    className={`flex-1 rounded-xl py-3 text-sm font-semibold ${
                      pending || !reason
                        ? 'bg-zinc-200 text-zinc-400 dark:bg-zinc-800 dark:text-zinc-600'
                        : 'bg-red-600 text-white'
                    }`}
                  >
                    신고하기
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
