'use server';

import { redirect } from 'next/navigation';
import { cookies, headers } from 'next/headers';

import { eq } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { profiles } from '@/lib/db/schema/profiles';
import {
  canEnterServer,
  createCharacterAuto,
  touchLastServer,
  latestOpenServerId,
} from '@/lib/game/server-select';
import { createSupabaseServerClient, createSupabaseServiceClient } from './supabase-server';
import { isTestLoginEnabled, TEST_ACCOUNTS, passwordForTestAccount } from './test-accounts';

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
    // 수집 항목: 이메일만(닉네임·프로필 이미지 제외 — PRIVACY 정책 정합). 앱은 닉네임=DB 자동생성,
    // 콜백은 user.id만 사용. ⚠ 카카오 콘솔 '동의항목'에서 '카카오계정(이메일)'이 사용 설정돼 있어야
    // 함(미설정 scope 요청 시 'KOE006 — 아직 설정하지 않은 동의항목' 에러).
    options: { redirectTo: callback, scopes: 'account_email' },
  });

  if (error) redirect(`/login?error=${encodeURIComponent(error.message)}`);
  if (data.url) redirect(data.url);
}

/**
 * 로그인 후 서버 선택 적용(콜백 미경유 경로 공용) — 콜백과 동일하게 "고른 서버에 캐릭터 1개" 보장.
 * 가입 트리거(0067)가 캐릭터를 안 만들므로, login_srv 없을 때도 last_server>최신open으로
 * 확정해 반드시 생성한다(가입 보너스 포함). 테스트/심사 로그인 양쪽이 호출.
 */
async function applyServerSelect(uid: string): Promise<void> {
  try {
    const srvRaw = Number((await cookies()).get('login_srv')?.value);
    let sid: number | null =
      Number.isInteger(srvRaw) && srvRaw >= 1 && srvRaw <= 32767 ? srvRaw : null;
    if (!sid) {
      const [p] = await db
        .select({ sid: profiles.lastServerId })
        .from(profiles)
        .where(eq(profiles.id, uid))
        .limit(1);
      sid = p?.sid ?? null;
    }
    if (!sid) sid = await latestOpenServerId();
    if (sid) {
      if (!(await canEnterServer(uid, sid))) await createCharacterAuto({ userId: uid, serverId: sid });
      await touchLastServer(uid, sid);
      (await cookies()).set('srv', String(sid), {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        path: '/',
        maxAge: 60 * 60 * 24 * 365,
      });
    }
  } catch (e) {
    console.warn('[login] server select skipped', (e as Error).message);
  }
}

/** 테스트/심사 계정 email의 Supabase Auth 유저 보장(없으면 생성) — 이미 있으면 무시. */
async function ensureTestUser(email: string): Promise<void> {
  try {
    const admin = createSupabaseServiceClient();
    await admin.auth.admin.createUser({
      email,
      password: passwordForTestAccount(email),
      email_confirm: true,
    });
  } catch {
    // 이미 가입됨 등 — 로그인 단계에서 검증.
  }
}

/**
 * 테스트 계정 로그인(버튼식) — `ALLOW_TEST_LOGIN=true`일 때만 동작(실운영 전환 시 env로 즉시 차단).
 * 해당 email의 Supabase Auth 유저를 (없으면) admin으로 생성 → 고정 비번 로그인(세션 쿠키 설정).
 */
export async function signInWithTestAccount(formData: FormData) {
  if (!isTestLoginEnabled()) redirect('/login?error=test_login_disabled');
  const email = String(formData.get('email') ?? '');
  if (!TEST_ACCOUNTS.some((a) => a.email === email)) {
    redirect('/login?error=invalid_test_account');
  }

  await ensureTestUser(email);
  // 요청 스코프 클라이언트라야 세션 쿠키가 설정됨.
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password: passwordForTestAccount(email),
  });
  if (error) redirect(`/login?error=${encodeURIComponent(error.message)}`);

  const { data } = await supabase.auth.getUser();
  if (data.user?.id) await applyServerSelect(data.user.id);
  redirect('/');
}

/**
 * 심사용 ID/PW 입력 로그인 — 포트원·게임위 심사관이 카카오 없이 자격증명으로 로그인.
 * `ALLOW_TEST_LOGIN=true`일 때만 동작(실운영 전환 시 env로 즉시 차단). 사전 등록된 테스트/심사
 * 계정 email만 허용하고, 비밀번호는 입력값으로 검증(signInWithPassword) — 틀리면 실패.
 */
export async function signInWithCredentials(formData: FormData) {
  if (!isTestLoginEnabled()) redirect('/login?test=cred&error=test_login_disabled');
  const email = String(formData.get('email') ?? '')
    .trim()
    .toLowerCase();
  const password = String(formData.get('password') ?? '');
  // 임의 Supabase 계정 비번 로그인 방지 — 사전 등록된 테스트/심사 계정만 허용.
  if (!TEST_ACCOUNTS.some((a) => a.email === email)) {
    redirect('/login?test=cred&error=' + encodeURIComponent('등록되지 않은 심사 계정입니다'));
  }

  await ensureTestUser(email); // 첫 로그인 시 계정 보장(비번은 고정값으로 생성됨).
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    redirect('/login?test=cred&error=' + encodeURIComponent('아이디 또는 비밀번호가 올바르지 않습니다'));
  }

  const { data } = await supabase.auth.getUser();
  if (data.user?.id) await applyServerSelect(data.user.id);
  redirect('/');
}

export async function signOut() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect('/login');
}
