import { NextResponse, type NextRequest } from 'next/server';

import { createSupabaseServerClient } from '@/lib/auth/supabase-server';

/**
 * Kakao OAuth 콜백 — Supabase 토큰 교환 후 이 경로로 리다이렉트.
 * code → 세션 쿠키 변환 후 next(기본 '/')로 이동.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  // 내부 경로만 허용 — open-redirect 방지(절대 URL·//호스트 차단).
  const rawNext = searchParams.get('next') ?? '/';
  const next = rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : '/';

  if (code) {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${next}`);
  }
  return NextResponse.redirect(`${origin}/login?error=oauth_failed`);
}
