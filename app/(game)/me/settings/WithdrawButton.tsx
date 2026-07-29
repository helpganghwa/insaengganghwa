'use client';

import { useState, useTransition } from 'react';

import { withdrawAction } from './withdraw-actions';
import { ModalShell } from '@/components/ModalShell';
import { ModalLayout, ModalButton } from '@/components/ModalLayout';

const ERR: Record<string, string> = {
  LEADER_MUST_TRANSFER: '길드장은 위임하거나 길드를 해산한 뒤 탈퇴할 수 있어요.',
  UNAUTHENTICATED: '로그인이 필요합니다.',
  UNKNOWN: '탈퇴 처리 중 오류가 발생했어요. 잠시 후 다시 시도해 주세요.',
};

export function WithdrawButton() {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  const confirm = () => {
    setErr(null);
    start(async () => {
      // 성공 시 서버가 /login으로 redirect(이 함수는 반환 안 함). 실패만 코드 반환.
      const r = await withdrawAction();
      if (r?.status === 'error') setErr(ERR[r.code] ?? ERR.UNKNOWN!);
    });
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full py-2 text-xs text-zinc-400 underline underline-offset-2"
      >
        회원탈퇴
      </button>

      {open && (
        <ModalShell onClose={() => !pending && setOpen(false)} label="회원 탈퇴 확인">
          <ModalLayout
            icon="⚠️"
            title="정말 탈퇴하시겠어요?"
            subtitle={<span className="font-bold text-red-500">복구 불가</span>}
            footer={
              <>
                <ModalButton tone="ghost" onClick={() => setOpen(false)} disabled={pending}>
                  취소
                </ModalButton>
                <ModalButton tone="danger" onClick={confirm} disabled={pending}>
                  {pending ? '처리 중…' : '탈퇴'}
                </ModalButton>
              </>
            }
          >
            <p className="text-center text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
              캐릭터·아이템·강화·보급 등 모든 게임 데이터가 즉시 삭제되며 복구할 수 없어요. 결제
              내역은 법령에 따라 보존됩니다.
            </p>
            {err && (
              <p className="mt-3 rounded-lg bg-red-50 px-2 py-1.5 text-center text-xs text-red-600 dark:bg-red-950/40 dark:text-red-300">
                {err}
              </p>
            )}
          </ModalLayout>
        </ModalShell>
      )}
    </>
  );
}
