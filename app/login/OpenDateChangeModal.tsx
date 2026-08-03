'use client';

import { useEffect, useState } from 'react';

import { ModalShell } from '@/components/ModalShell';
import { ModalLayout, ModalButton } from '@/components/ModalLayout';

/**
 * 오픈일 변경 안내(2026-08-03) — CBT 종료 화면에 한 번만 뜨는 팝업.
 *
 * 종료 화면 본문은 날짜만 8/17로 고쳤기 때문에, 8/10으로 안내받았던 사람이 변경 자체를
 * 모르고 지나칠 수 있다. 그 한 번을 이 팝업이 맡는다. 닫으면 로컬에 표시해 다시 뜨지 않는다
 * (기기별 1회 — 로그아웃 화면이라 서버에 남길 식별자가 없다).
 */
const SEEN_KEY = 'ig:open-date-change-2026-08-17';

export function OpenDateChangeModal() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      if (!localStorage.getItem(SEEN_KEY)) setOpen(true);
    } catch {
      // 저장소 불가(사파리 프라이빗 등) — 매번 뜨는 편이 안 뜨는 것보다 낫다.
      setOpen(true);
    }
  }, []);

  const close = () => {
    setOpen(false);
    try {
      localStorage.setItem(SEEN_KEY, '1');
    } catch {
      // 저장 실패는 무시 — 다음 방문에 한 번 더 뜰 뿐이다.
    }
  };

  if (!open) return null;

  return (
    <ModalShell
      onClose={close}
      onSubmit={close}
      label="오픈일 변경 안내"
      className="w-[320px] max-w-[calc(100vw-32px)]"
    >
      <ModalLayout
        title="오픈일이 한 주 미뤄졌습니다"
        footer={
          <ModalButton tone="primary" grow={2} onClick={close}>
            알겠어요
          </ModalButton>
        }
      >
        <div className="space-y-3 text-[13px] leading-[1.8] text-zinc-300">
          <p className="break-keep">
            8월 10일로 안내드렸던 정식 오픈을{' '}
            <b className="font-bold text-amber-300">8월 17일 오전 11시</b>로 옮깁니다.
          </p>
          <p className="break-keep">
            장비 열네 자루를 더 벼리고 있어요. 조금 더 다듬어 문을 열겠습니다.
          </p>
          <p className="break-keep text-zinc-400">기다려 주셔서 고맙습니다.</p>
        </div>
      </ModalLayout>
    </ModalShell>
  );
}
