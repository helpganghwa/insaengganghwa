'use server';

import { redirect } from 'next/navigation';
import { headers } from 'next/headers';

import { createSupabaseServerClient } from './supabase-server';

/** Kakao OAuth 로그인 — Supabase 관리형. 단독 인증(GDD §1). */
export async function signInWithKakao() {
  const supabase = await createSupabaseServerClient();
  const origin = (await headers()).get('origin') ?? 'http://localhost:5174';

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'kakao',
    options: { redirectTo: `${origin}/auth/callback` },
  });

  if (error) redirect(`/login?error=${encodeURIComponent(error.message)}`);
  if (data.url) redirect(data.url);
}

export async function signOut() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect('/login');
}
