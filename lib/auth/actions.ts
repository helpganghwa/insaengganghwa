'use server';

import { redirect } from 'next/navigation';
import { cookies, headers } from 'next/headers';

import { canEnterServer, createCharacterAuto, touchLastServer } from '@/lib/game/server-select';
import { createSupabaseServerClient, createSupabaseServiceClient } from './supabase-server';
import { isTestLoginEnabled, TEST_ACCOUNTS, TEST_PASSWORD } from './test-accounts';

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

/**
 * 테스트 계정 로그인 — `ALLOW_TEST_LOGIN=true`일 때만 동작(실운영 전환 시 env로 즉시 차단).
 * 해당 email의 Supabase Auth 유저를 (없으면) admin으로 생성 → 비번 로그인(세션 쿠키 설정).
 */
export async function signInWithTestAccount(formData: FormData) {
  if (!isTestLoginEnabled()) redirect('/login?error=test_login_disabled');
  const email = String(formData.get('email') ?? '');
  if (!TEST_ACCOUNTS.some((a) => a.email === email)) {
    redirect('/login?error=invalid_test_account');
  }

  // 1) 계정 보장 — 이미 있으면 createUser가 에러를 내지만 무시하고 로그인 시도.
  try {
    const admin = createSupabaseServiceClient();
    await admin.auth.admin.createUser({ email, password: TEST_PASSWORD, email_confirm: true });
  } catch {
    // 이미 가입됨 등 — 로그인 단계에서 검증.
  }

  // 2) 비번 로그인 — 요청 스코프 클라이언트라야 세션 쿠키가 설정됨.
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password: TEST_PASSWORD });
  if (error) redirect(`/login?error=${encodeURIComponent(error.message)}`);

  // 서버 선택 적용(콜백 미경유 경로) — ServerPicker가 기록한 login_srv 쿠키.
  const srvRaw = Number((await cookies()).get('login_srv')?.value);
  if (Number.isInteger(srvRaw) && srvRaw >= 1 && srvRaw <= 32767) {
    const { data } = await supabase.auth.getUser();
    const uid = data.user?.id;
    if (uid) {
      try {
        if (!(await canEnterServer(uid, srvRaw))) await createCharacterAuto({ userId: uid, serverId: srvRaw });
        await touchLastServer(uid, srvRaw);
        (await cookies()).set('srv', String(srvRaw), {
          httpOnly: true,
          sameSite: 'lax',
          path: '/',
          maxAge: 60 * 60 * 24 * 365,
        });
      } catch (e) {
        console.warn('[login.test] server select skipped', (e as Error).message);
      }
    }
  }
  redirect('/');
}

export async function signOut() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect('/login');
}
