'use client';

import { useState } from 'react';

import { NicknameChangeModal } from './NicknameChangeModal';

/**
 * 프로필 페이지의 닉네임 클릭 트리거.
 * 사용자 결정(2026-05-21): ✎ 아이콘 제거. 닉네임 자체가 클릭 가능 = 변경 팝업 노출.
 * 첫 변경 무료 / 이후 1000다이아 — NicknameChangeModal에서 처리.
 */
export function NicknameEditor({
  current,
  changedCount,
  diamond,
  className,
}: {
  current: string;
  changedCount: number;
  diamond: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="닉네임 변경"
        className={`text-lg font-semibold tracking-tight ${className ?? ''}`}
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
