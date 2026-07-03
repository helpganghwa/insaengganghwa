'use client';

/**
 * 에러 바운더리 → /api/client-error 리포트 — 서버 컴포넌트 렌더/서버 액션 에러가
 * Vercel 로그에만 남는 관측 사각을 메운다. 서버 에러는 클라에 digest만 오므로
 * message에 digest를 포함해 fingerprint가 유의미하게 그룹화되게 한다.
 * sendBeacon 우선(ClientErrorReporter와 동일 계약), 실패는 무시(best-effort).
 */
export function reportBoundaryError(kind: string, error: Error & { digest?: string }): void {
  try {
    const message = `${error.message || 'unknown'}${error.digest ? ` [digest:${error.digest}]` : ''}`;
    const body = JSON.stringify({
      kind,
      message,
      stack: error.stack?.slice(0, 1500),
      url: location.href,
      ua: navigator.userAgent,
    });
    if (navigator.sendBeacon) {
      navigator.sendBeacon('/api/client-error', new Blob([body], { type: 'application/json' }));
    } else {
      void fetch('/api/client-error', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body,
        keepalive: true,
      }).catch(() => {});
    }
  } catch {
    /* 관측은 best-effort */
  }
}
