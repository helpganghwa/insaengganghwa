'use client';

import { useState, useTransition } from 'react';
import { ZoomSafeTextarea } from '@/components/ui/ZoomSafeField';

import { reportProfile } from './actions';

const REASONS: { value: string; label: string }[] = [
  { value: 'nickname', label: '부적절한 닉네임' },
  { value: 'avatar', label: '부적절한 아바타' },
  { value: 'bug_abuse', label: '버그 악용' },
  { value: 'other', label: '기타' },
];

// 상세 입력칸을 노출하는 사유 — 기타 + 버그 악용(어떤 버그를 어떻게 악용했는지 필요).
const NOTE_REASONS = new Set(['other', 'bug_abuse']);
const NOTE_PLACEHOLDER: Record<string, string> = {
  bug_abuse: '어떤 버그를 어떻게 악용했는지 적어주세요 (최대 200자)',
  other: '사유를 간단히 적어주세요 (최대 200자)',
};

export function ReportButton({ profileId }: { profileId: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const openModal = () => {
    // 재오픈 시 이전 완료/선택 상태 초기화(완료팝업 잔존 버그 방지).
    setDone(false);
    setReason(null);
    setNote('');
    setErr(null);
    setOpen(true);
  };

  const submit = () => {
    if (!reason) return;
    setErr(null);
    startTransition(async () => {
      const r = await reportProfile(profileId, reason, NOTE_REASONS.has(reason) ? note : undefined);
      if (r.status === 'error') {
        setErr(r.message);
        return;
      }
      setDone(true);
    });
  };

  return (
    <>
      <button
        type="button"
        onClick={openModal}
        className="flex w-full items-center justify-center rounded-xl bg-transparent py-2.5 text-sm font-semibold text-zinc-400 transition active:scale-[0.98] hover:bg-zinc-900/40"
      >
        신고
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
                {reason && NOTE_REASONS.has(reason) && (
                  <ZoomSafeTextarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    maxLength={200}
                    placeholder={NOTE_PLACEHOLDER[reason] ?? '사유를 간단히 적어주세요 (최대 200자)'}
                    wrapClassName="mt-2 h-[54px] w-full"
                    className="rounded-xl border border-zinc-200 p-2 dark:border-zinc-800 dark:bg-zinc-900"
                  />
                )}
                {err && (
                  <p className="mt-2 rounded-lg bg-red-50 px-2 py-1 text-xs text-red-600 dark:bg-red-950/40 dark:text-red-300">
                    {err}
                  </p>
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
