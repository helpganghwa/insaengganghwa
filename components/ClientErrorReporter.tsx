'use client';

import { useEffect } from 'react';

/**
 * 전역 클라이언트 에러 → /api/client-error 수집(서버 로그). Sentry 없이 v1 관측성.
 *
 * unhandledrejection + window.error 캡처. 세션당 최대 MAX건·동일 메시지 dedupe로 폭주 방지.
 * sendBeacon 우선(언로드 중에도 전송), 폴백 fetch keepalive. UI 영향 없음.
 */
const MAX_PER_SESSION = 8;

export function ClientErrorReporter() {
  useEffect(() => {
    let sent = 0;
    const seen = new Set<string>();

    const report = (kind: string, message: string, stack?: string) => {
      if (sent >= MAX_PER_SESSION) return;
      const key = `${kind}:${message}`.slice(0, 200);
      if (seen.has(key)) return;
      seen.add(key);
      sent += 1;
      const body = JSON.stringify({
        kind,
        message: message?.slice(0, 500),
        stack: stack?.slice(0, 1500),
        url: location.pathname + location.search,
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
