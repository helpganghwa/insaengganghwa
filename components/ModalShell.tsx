'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import {
  currentModalToken,
  markModalBack,
  MODAL_HISTORY_KEY,
  modalHistoryClosed,
  modalHistoryOpened,
  nextModalToken,
  shouldCloseOnPop,
  shouldRewindOnUnmount,
} from '@/lib/ui/modal-history';

// 열린 셸의 전역 스택 — Esc/Enter는 **최상단 모달만** 반응한다. 종전엔 셸마다 document
// keydown을 달아 stacked 팝업(다이아 부족 등)이 떠 있을 때 Esc 한 번에 호스트 팝업까지
// 같이 닫혔다(입력 중 닉네임 소실 등, 2026-08-22 적대 검수). 마운트 순서 = 시각적 층위
// (body 포털 뒤 마운트가 위)라 스택 말단 = 최상단.
const openShells: symbol[] = [];

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
  stacked = false,
  receded = false,
  backToClose = true,
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
  /**
   * 다른 모달 **위에** 겹쳐 뜨는 경우(주로 확인 팝업). 아래 모달이 이미 배경을 어둡게·
   * 흐리게 하고 있으므로 여기서 또 깔면 두 겹이 되어 과하게 어두워진다. 살짝만 덧댄다.
   */
  /** (중첩 표시용 잔여 플래그 — 백드롭은 항상 온전한 dim. 2026-08-22 사용자 확정: 나중에 뜬
      공통 팝업이 dim 레이어를 포함해 이전 팝업 위에 쌓인다.) */
  stacked?: boolean;
  /**
   * 위에 다른 모달이 겹친 동안 **뒤로 물러난** 상태. 축소·반투명으로 내려앉아 위 팝업과
   * 층위가 분리돼 보인다(두 패널이 같은 무게로 겹쳐 보이던 문제, 2026-07-30).
   * 물러난 동안은 조작 불가 — 위 팝업이 닫히면 원래대로 돌아온다.
   */
  receded?: boolean;
  /**
   * 안드로이드 뒤로가기로 닫을지(기본 true). **닫을 수단이 없는 팝업만** false로 둔다 —
   * 그런 팝업에 히스토리 항목을 쌓으면 뒤로가기 한 번이 아무 일도 없이 삼켜지고, 종료는
   * 다음 한 번으로 미뤄질 뿐이다(튜토리얼 인트로).
   */
  backToClose?: boolean;
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
  // 셸 스택 등록 — 키 핸들러의 최상단 판정 근거.
  const shellId = useRef<symbol | null>(null);
  // 언마운트 정리에서 최신 onClose를 쓰되, effect는 마운트/언마운트에만 돌게 한다.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  if (shellId.current === null) shellId.current = Symbol('modal-shell');
  useEffect(() => {
    const id = shellId.current!;
    openShells.push(id);
    return () => {
      const i = openShells.indexOf(id);
      if (i >= 0) openShells.splice(i, 1);
    };
  }, []);
  // Esc 닫기 / Enter 확정 — onClose·onSubmit 최신값만 반영(포커스 재설정과 분리).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // 최상단 셸만 키에 반응 — 중첩(stacked) 상태에서 아래 모달의 동시 반응 차단.
      if (openShells[openShells.length - 1] !== shellId.current) return;
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

  /**
   * 안드로이드 뒤로가기 — 앱(TWA)에는 주소창이 없어 뒤로가기가 유일한 '취소' 수단이다. 히스토리를
   * 쌓아 두지 않으면 모달이 뜬 상태의 뒤로가기가 이전 라우트로 이동해 버리고, 홈에서는 **앱이 종료된다**
   * (2026-09-11 출시 전수조사). 셸 한 곳에서 처리해 모든 모달·바텀시트가 같은 규칙을 따르게 한다.
   *
   * 규칙: 열릴 때 내 토큰을 실은 항목 하나를 쌓고, 그 항목이 사라지는 popstate에만 닫는다.
   * 판정은 **전부 history.state의 토큰**으로 한다 — 열린 순서(스택)로 판정하면 중첩 모달에서
   * 어긋난다(아래 두 함정, 2026-09-12 재검수).
   *
   * ⚠ 중첩 모달: 위 팝업이 닫히면 현재 항목은 **내 토큰**으로 돌아온다. 즉 `내 토큰 === 현재`면
   *   사라진 건 내 항목이 아니므로 반응하지 않는다. 이 가드가 없으면 확인 팝업에서 '취소'를 누를 때
   *   뒤에 있던 시트까지 같이 닫혔다.
   * ⚠ 라우트 이동: 모달을 연 채 링크를 누르면 새 라우트가 push돼 내 항목이 히스토리 **아래로 묻힌다**.
   *   이때 back()을 부르면 방금 떠난 화면으로 도로 튕긴다(튜토리얼 완료 CTA·다이아 충전 유도 동선).
   *   내 항목이 현재일 때만 걷어낸다.
   */
  useEffect(() => {
    if (!backToClose || typeof window === 'undefined') return;
    const token = nextModalToken();
    let poppedByBack = false;
    const onPop = () => {
      if (!shouldCloseOnPop(currentModalToken(), token)) return; // 내 항목은 그대로 — 위 팝업이 닫힌 것이다.
      poppedByBack = true;
      onCloseRef.current();
    };
    window.history.pushState({ [MODAL_HISTORY_KEY]: token }, '');
    modalHistoryOpened();
    window.addEventListener('popstate', onPop);
    return () => {
      window.removeEventListener('popstate', onPop);
      modalHistoryClosed();
      if (!shouldRewindOnUnmount({ poppedByBack, currentToken: currentModalToken(), myToken: token })) {
        return; // 뒤로가기로 이미 소비됐거나, 라우트 이동으로 히스토리 아래에 묻혔다.
      }
      markModalBack();
      window.history.back();
    };
  }, [backToClose]);

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
        aria-hidden={receded || undefined}
        tabIndex={-1}
        // break-keep: 한국어 어절 중간 꺾임 방지(단어 단위 개행) / overflow-wrap: 긴 영문·URL은 강제 개행.
        // ⚠ text-wrap:pretty/balance 금지(2026-09-04) — iOS Safari는 pretty를 문단 전체 줄 길이 균등화로
        // 구현해 줄이 오른쪽까지 차지 않고 왼쪽으로 쏠려 보였다(실기기 피드백). 평범한 단어 단위 개행만 쓴다.
        className={`break-keep outline-none transition-[transform,opacity,filter] duration-150 [overflow-wrap:anywhere] ${
          receded ? 'pointer-events-none scale-[0.94] opacity-35 blur-[1px]' : ''
        } ${className}`}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}
