'use server';

import { redirect } from 'next/navigation';
import { headers } from 'next/headers';

import { createSupabaseServerClient } from './supabase-server';

/** 내부 경로만 허용 — open-redirect 방지(절대 URL·//호스트 차단). */
function safeNext(raw: unknown): string {
  const s = typeof raw === 'string' ? raw : '';
  return s.startsWith('/') && !s.startsWith('//') ? s : '';
}

/**
 * Kakao OAuth 로그인 — Supabase 관리형. 단독 인증(GDD §1).
 * formData.next(내부 경로)가 있으면 로그인 후 그 경로로 복귀(레이드 초대 등). 기본 '/'.
 */
export async function signInWithKakao(formData?: FormData) {
  const supabase = await createSupabaseServerClient();
  const origin = (await headers()).get('origin') ?? 'http://localhost:5174';

  const next = safeNext(formData?.get('next'));
  const callback = next
    ? `${origin}/auth/callback?next=${encodeURIComponent(next)}`
    : `${origin}/auth/callback`;

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'kakao',
    options: { redirectTo: callback },
  });

  if (error) redirect(`/login?error=${encodeURIComponent(error.message)}`);
  if (data.url) redirect(data.url);
}

export async function signOut() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect('/login');
}
