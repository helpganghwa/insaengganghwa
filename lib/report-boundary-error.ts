'use client';

/**
 * 에러 바운더리 → /api/client-error 리포트 — 서버 컴포넌트 렌더/서버 액션 에러가
 * Vercel 로그에만 남는 관측 사각을 메운다. 서버 에러는 클라에 digest만 오므로
 * message에 digest를 포함해 fingerprint가 유의미하게 그룹화되게 한다.
 * sendBeacon 우선(ClientErrorReporter와 동일 계약), 실패는 무시(best-effort).
 */
import { BENIGN_PATTERNS } from '@/components/ClientErrorReporter';

export function reportBoundaryError(kind: string, error: Error & { digest?: string }): void {
  try {
    // 네트워크성 실패는 미수집 — 배포 경계에서 구 빌드가 새 청크/RSC를 fetch하다 실패하면
    // 'Load failed'(Safari)류가 바운더리로 튀어 노이즈가 됨(2026-07-13 #14, 배포 직후 ×3).
    // 단 digest가 있으면 서버 렌더 에러(진짜 신호)라 필터하지 않는다.
    if (!error.digest) {
      const m = (error.message || '').toLowerCase();
      if (BENIGN_PATTERNS.some((b) => m.includes(b))) return;
    }
    const message = `${error.message || 'unknown'}${error.digest ? ` [digest:${error.digest}]` : ''}`;
    const body = JSON.stringify({
      kind,
      message,
      stack: error.stack?.slice(0, 1500),
      url: location.origin + location.pathname, // 쿼리 제외 — 콜백 토큰 등 시크릿의 DB 잔류 방지

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
