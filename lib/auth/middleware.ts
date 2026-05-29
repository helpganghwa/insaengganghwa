import 'server-only';

import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

/**
 * 모든 요청에서 세션 쿠키 자동 갱신 — Supabase SSR **필수 패턴**.
 * 여기 `getUser()`는 토큰 갱신을 트리거하는 SSR 표준(요청당 1회, 쿠키 리프레시 겸용).
 * 앱 페이지/액션의 세션 식별은 `lib/auth/session.ts`의 로컬 JWT(`getClaims`) 사용
 * — 핫패스 추가 RTT 회피(CLAUDE §11.1). 미들웨어 갱신은 그 예외.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // 세션 쿠키 refresh — SSR 표준(getUser가 만료 토큰 갱신 트리거). 단 Auth 원격 호출이
  // 콜드/지연 시 미들웨어가 통째로 hang하면 전 사이트가 about:blank 무한로딩이 되므로
  // 타임아웃 가드 필수(2026-05-29). 실패/지연 시 그대로 통과 — 세션 식별은 각 페이지의
  // getSessionUserId(로컬 JWT)가 수행하므로 refresh 누락은 다음 요청에서 자연 복구.
  try {
    await Promise.race([
      supabase.auth.getUser(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('SESSION_REFRESH_TIMEOUT')), 2500),
      ),
    ]);
  } catch {
    // best-effort — 통과.
  }
  return response;
}
