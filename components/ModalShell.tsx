'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * 접근성 모달 셸 — 백드롭(클릭 시 닫힘) + 패널(role=dialog·aria-modal·Esc·마운트 시 포커스).
 *
 * **body 포털 렌더** — 부모의 스택 컨텍스트(isolate·transform)와 무관하게 항상 최상단 레이어에 뜬다.
 * z-50 단일 레이어(헤더/GNB z-30·채팅 z-40 위). 배경 bg-black/60 + blur-sm 공통 — 모든 모달 통일.
 * 패널 크기/스크롤/배경은 호출처가 className으로 지정(기존 외형 유지). 정렬은 align(center 기본|bottom|top).
 */
export function ModalShell({
  onClose,
  label,
  className = '',
  align = 'center',
  children,
}: {
  onClose: () => void;
  /** 스크린리더용 라벨(모달 제목 텍스트). */
  label: string;
  /** 패널 className — 크기·스크롤·패딩·배경 등. */
  className?: string;
  /** 패널 정렬 — 중앙(기본) | 하단 시트 | 상단. */
  align?: 'center' | 'bottom' | 'top';
  children: React.ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (!mounted) return;
    panelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [mounted, onClose]);

  if (!mounted) return null; // 포털은 클라이언트 마운트 후에만(SSR 하이드레이션 안전)
  const alignCls = align === 'bottom' ? 'items-end' : align === 'top' ? 'items-start' : 'items-center';
  return createPortal(
    <div
      className={`fixed inset-0 z-50 flex justify-center ${alignCls} bg-black/60 p-4 backdrop-blur-sm`}
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
    </div>,
    document.body,
  );
}
