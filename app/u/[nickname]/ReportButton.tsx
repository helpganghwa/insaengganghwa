'use client';

import { useState, useTransition } from 'react';

import { ModalShell } from '@/components/ModalShell';
import { ModalLayout, ModalButton } from '@/components/ModalLayout';
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
        // 손으로 만든 시트였다 — role/aria·Esc·포커스가 없어 공용 셸로 옮긴다(2026-07-29 점검).
        <ModalShell onClose={() => !pending && setOpen(false)} label="프로필 신고">
          <ModalLayout
            title={done ? '신고가 접수되었습니다' : '프로필 신고'}
            subtitle={done ? '검토 후 조치됩니다' : '사유를 골라주세요'}
            maxBodyClass="max-h-[52vh]"
            footer={
              done ? (
                <ModalButton tone="neutral" onClick={() => setOpen(false)}>
                  닫기
                </ModalButton>
              ) : (
                <>
                  <ModalButton tone="ghost" onClick={() => setOpen(false)} disabled={pending}>
                    취소
                  </ModalButton>
                  <ModalButton tone="danger" onClick={submit} disabled={pending || !reason}>
                    신고하기
                  </ModalButton>
                </>
              )
            }
          >
          <div>
            {done ? (
              <p className="py-2 text-center text-[12.5px] text-zinc-500 dark:text-zinc-400">
                접수된 내용은 운영자가 확인 후 조치합니다. 감사합니다.
              </p>
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
              </>
            )}
          </div>
          </ModalLayout>
        </ModalShell>
      )}
    </>
  );
}
