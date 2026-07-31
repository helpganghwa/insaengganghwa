import { NextResponse } from 'next/server';

import { createSupabaseServerClient } from '@/lib/auth/supabase-server';

export const dynamic = 'force-dynamic';

/**
 * 서버 주도 로그아웃(0144) — RSC 렌더 중엔 쿠키를 지울 수 없어, 레이아웃이 강제 로그아웃이
 * 필요할 때(CBT 종료 모드에서 일반 유저 차단) 이 라우트로 리다이렉트한다.
 * Route Handler는 쿠키 변경이 허용되므로 여기서 세션을 끊고 로그인 화면으로 보낸다.
 */
export async function GET(req: Request) {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut().catch(() => undefined);
  const url = new URL(req.url);
  const reason = url.searchParams.get('reason');
  const dest = new URL('/login', url.origin);
  if (reason) dest.searchParams.set('reason', reason);
  return NextResponse.redirect(dest);
}
