'use client';

import { useEffect, useRef } from 'react';

import { recentPayResultAction } from '@/app/(game)/shop/actions';

/**
 * PWA 복귀 결과 팝업 훅(2026-08-22) — 홈 화면 앱에선 결제·본인인증창이 외부 브라우저 탭에서
 * 열려 리다이렉트 복귀 파라미터가 앱으로 돌아오지 않는다(지급은 웹훅 처리로 잔액만 갱신).
 * 마운트·visibilitychange(visible) 시 서버에서 최근 15분 결과를 조회해 콜백으로 알리고,
 * localStorage ack로 같은 결과의 중복 표시를 막는다(인라인 성공 경로도 같은 ack를 쓴다).
 */
const PAY_ACK = 'ig:payack';
const IDV_ACK = 'ig:idvack';

function acked(key: string, v: string): boolean {
  try {
    return localStorage.getItem(key) === v;
  } catch {
    return true; // 스토리지 불가 환경 — 중복 억제 못 하면 표시도 포기(스팸 방지 우선)
  }
}
export function ackPayResult(kind: 'pay' | 'idv', v: string): void {
  try {
    localStorage.setItem(kind === 'pay' ? PAY_ACK : IDV_ACK, v);
  } catch {
    /* noop */
  }
}

export function usePayResumeNotice(handlers: {
  onPaid?: (r: { paymentId: string; productCode: string }) => void;
  onVerified?: () => void;
}): void {
  const ref = useRef(handlers);
  ref.current = handlers;
  useEffect(() => {
    let alive = true;
    const check = () => {
      if (document.visibilityState !== 'visible') return;
      void recentPayResultAction()
        .then((r) => {
          if (!alive) return;
          if (r.paid && ref.current.onPaid && !acked(PAY_ACK, r.paid.paymentId)) {
            ackPayResult('pay', r.paid.paymentId);
            ref.current.onPaid({ paymentId: r.paid.paymentId, productCode: r.paid.productCode });
          }
          if (r.verifiedAtIso && ref.current.onVerified && !acked(IDV_ACK, r.verifiedAtIso)) {
            ackPayResult('idv', r.verifiedAtIso);
            ref.current.onVerified();
          }
        })
        .catch(() => {}); // 조회 실패는 침묵 — 다음 복귀 때 재시도
    };
    check();
    document.addEventListener('visibilitychange', check);
    return () => {
      alive = false;
      document.removeEventListener('visibilitychange', check);
    };
  }, []);
}
