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

  await supabase.auth.getUser();
  return response;
}
