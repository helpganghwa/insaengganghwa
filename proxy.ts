import type { NextRequest } from 'next/server';

import { updateSession } from '@/lib/auth/middleware';

// Next.js 16: middleware → proxy. export 함수명 `proxy` 필수.
export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    // 정적 자산/이미지/Next 내부 제외 — 나머지 모든 요청 세션 갱신.
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
