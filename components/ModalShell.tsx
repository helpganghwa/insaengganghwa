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
  onSubmit,
  label,
  className = '',
  align = 'center',
  children,
}: {
  onClose: () => void;
  /**
   * Enter로 실행할 주 동작(PC 전용 편의) — 닫기는 Esc, 확정은 Enter.
   * 3초 재확인이 걸린 버튼이면 첫 Enter가 무장, 두 번째가 확정으로 손 동작과 같아진다.
   */
  onSubmit?: () => void;
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
  // 포커스는 마운트 직후 **1회만**. onClose를 deps에 넣으면(호출처가 매 렌더 새 클로저를 넘길 때)
  // 부모 리렌더마다 패널로 포커스가 튀어 내부 인풋이 blur된다(강화 카드 1초 타이머 리렌더 사례).
  useEffect(() => {
    if (mounted) panelRef.current?.focus();
  }, [mounted]);
  // Esc 닫기 / Enter 확정 — onClose·onSubmit 최신값만 반영(포커스 재설정과 분리).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key !== 'Enter' || !onSubmit) return;
      // 한글 조합 중의 Enter는 글자 확정이지 제출이 아니다.
      if (e.isComposing) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      // 버튼·링크는 Enter가 이미 클릭이고, 여러 줄 입력은 줄바꿈이 우선이다.
      if (tag === 'BUTTON' || tag === 'A' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      e.preventDefault();
      onSubmit();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, onSubmit]);

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
