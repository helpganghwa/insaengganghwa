'use client';

import { useEffect, useRef } from 'react';

/**
 * 접근성 모달 셸 — 백드롭(클릭 시 닫힘) + 패널(role=dialog·aria-modal·Esc·마운트 시 포커스).
 * 패널 크기/스크롤/배경은 호출처가 className으로 지정(기존 모달 외형 유지). 가운데 정렬·blur 공통.
 */
export function ModalShell({
  onClose,
  label,
  className = '',
  children,
}: {
  onClose: () => void;
  /** 스크린리더용 라벨(모달 제목 텍스트). */
  label: string;
  /** 패널 className — 크기·스크롤·패딩·배경 등. */
  className?: string;
  children: React.ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    panelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        className={`outline-none ${className}`}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}
