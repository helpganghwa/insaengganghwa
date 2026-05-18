import { NextResponse, type NextRequest } from 'next/server';

import { createSupabaseServerClient } from '@/lib/auth/supabase-server';

/**
 * Kakao OAuth 콜백 — Supabase 토큰 교환 후 이 경로로 리다이렉트.
 * code → 세션 쿠키 변환 후 next(기본 '/')로 이동.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/';

  if (code) {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${next}`);
  }
  return NextResponse.redirect(`${origin}/login?error=oauth_failed`);
}
