'use client';

import { ModalShell } from '@/components/ModalShell';
import { ModalLayout, ModalButton } from '@/components/ModalLayout';

/**
 * 결제·본인인증 결과 안내 팝업(2026-08-22) — 리다이렉트 복귀 직후의 토스트는 페이지
 * 리렌더와 겹쳐 놓치기 쉽다. 돈이 오간 결과는 명시적으로 닫는 공통 팝업으로 알린다.
 * (상점의 payNotice와 같은 형태 — 진입점이 여러 파일이라 공용으로 분리.)
 */
export function ResultNoticeModal({
  icon,
  title,
  body,
  onClose,
}: {
  icon?: string;
  title: string;
  body?: string;
  onClose: () => void;
}) {
  return (
    <ModalShell onClose={onClose} label={title}>
      <ModalLayout
        icon={icon ? <span className="text-3xl">{icon}</span> : undefined}
        title={title}
        footer={
          <ModalButton tone="primary" onClick={onClose}>
            확인
          </ModalButton>
        }
      >
        {body ? (
          <p className="text-center text-[12.5px] leading-relaxed text-zinc-500 dark:text-zinc-300">{body}</p>
        ) : null}
      </ModalLayout>
    </ModalShell>
  );
}
