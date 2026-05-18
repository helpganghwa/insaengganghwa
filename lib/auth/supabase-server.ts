import 'server-only';

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * Server Components / Server Actions / Route Handlers 용 — 요청별 쿠키 컨텍스트 동기화.
 * 세션 식별은 `lib/auth/session.ts`의 로컬 JWT 검증을 우선 사용 (CLAUDE §11.1).
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Server Component에서 set 불가 — 미들웨어/proxy가 갱신 책임.
          }
        },
      },
    },
  );
}

/**
 * 게임 로직(강화/초월/보급/레이드) 트랜잭션용 — RLS 우회 service role.
 * **trusted server-side 전용. 절대 클라이언트 노출 금지.**
 */
export function createSupabaseServiceClient() {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY required for service client');
  }
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { cookies: { getAll: () => [], setAll: () => {} } },
  );
}
