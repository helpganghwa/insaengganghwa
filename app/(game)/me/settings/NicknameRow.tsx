'use client';

import { useState } from 'react';

import { NicknameChangeModal } from '../NicknameChangeModal';

/**
 * 설정 페이지의 닉네임 row — 클릭 시 NicknameChangeModal 오픈(프로필 페이지와 동일).
 * 첫 변경 무료 / 이후 1000다이아.
 */
export function NicknameRow({
  current,
  changedCount,
  diamond,
}: {
  current: string;
  changedCount: number;
  diamond: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-sm text-zinc-500 underline"
      >
        {current}
      </button>
      <NicknameChangeModal
        open={open}
        onClose={() => setOpen(false)}
        currentNickname={current}
        changedCount={changedCount}
        diamond={diamond}
      />
    </>
  );
}
