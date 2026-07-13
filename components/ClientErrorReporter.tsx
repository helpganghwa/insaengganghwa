'use client';

import { useEffect } from 'react';

/**
 * 전역 클라이언트 에러 → /api/client-error 수집(서버 로그). Sentry 없이 v1 관측성.
 *
 * unhandledrejection + window.error 캡처. 세션당 최대 MAX건·동일 메시지 dedupe로 폭주 방지.
 * sendBeacon 우선(언로드 중에도 전송), 폴백 fetch keepalive. UI 영향 없음.
 */
const MAX_PER_SESSION = 8;

// Safari/모바일에서 fetch가 내비게이션·탭전환·화면잠금·약전파로 취소될 때 흔한 양성 거부.
// 실제 코드 버그가 아니라 네트워크 노이즈라 수집에서 제외(패널 신호 보존). 소문자 부분일치.
const BENIGN_PATTERNS = [
  'load failed', // Safari: fetch 실패/취소
  'failed to fetch', // Chrome/Edge: 동일
  'networkerror', // Firefox 등
  'network request failed',
  'the operation was aborted',
  'aborterror',
  'cancelled',
  'the network connection was lost',
  // 크로스오리진 스크립트(카카오 픽셀 등)가 CORS로 잘려 넘기는 opaque 에러 —
  // 스택·라인·실메시지가 원천 제거돼 디버깅 불가. 동일오리진 버그는 이 문자열을 만들지
  // 않으므로(항상 실메시지 동반) 필터해도 진짜 신호 손실 없음. Sentry도 기본 무시.
  'script error',
  // 리사이즈 콜백이 한 프레임에 다 못 끝날 때 브라우저가 내는 경고 — 실제 동작엔 무해
  // (남은 알림은 다음 프레임에 전달). 'loop limit exceeded'/'undelivered notifications' 두 변형 모두 포함.
  'resizeobserver',
];
const isBenign = (message: string) => {
  const m = message.toLowerCase();
  return BENIGN_PATTERNS.some((b) => m.includes(b));
};

export function ClientErrorReporter() {
  useEffect(() => {
    let sent = 0;
    const seen = new Set<string>();

    const report = (kind: string, message: string, stack?: string) => {
      if (sent >= MAX_PER_SESSION) return;
      if (message && isBenign(message)) return; // 양성 네트워크 노이즈 제외
      const key = `${kind}:${message}`.slice(0, 200);
      if (seen.has(key)) return;
      seen.add(key);
      sent += 1;
      const body = JSON.stringify({
        kind,
        message: message?.slice(0, 500),
        stack: stack?.slice(0, 1500),
        url: location.pathname, // search 제외 — 콜백 토큰·추천코드 등 시크릿 DB 잔류 방지(report-boundary와 동일 정책)
        ua: navigator.userAgent.slice(0, 200),
      });
      try {
        if (navigator.sendBeacon) {
          navigator.sendBeacon('/api/client-error', new Blob([body], { type: 'application/json' }));
        } else {
          void fetch('/api/client-error', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body,
            keepalive: true,
          });
        }
      } catch {
        // 전송 실패 — 무시(관측은 best-effort).
      }
    };

    const onRejection = (e: PromiseRejectionEvent) => {
      const r = e.reason;
      report(
        'unhandledrejection',
        r instanceof Error ? r.message : String(r),
        r instanceof Error ? r.stack : undefined,
      );
    };
    const onError = (e: ErrorEvent) => {
      report('error', e.message, e.error instanceof Error ? e.error.stack : undefined);
    };

    window.addEventListener('unhandledrejection', onRejection);
    window.addEventListener('error', onError);
    return () => {
      window.removeEventListener('unhandledrejection', onRejection);
      window.removeEventListener('error', onError);
    };
  }, []);

  return null;
}
