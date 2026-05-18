import 'server-only';

import { createSupabaseServerClient } from './supabase-server';

/**
 * 세션 식별 — **로컬 JWT 검증** (CLAUDE §11.1).
 *
 * 핫패스에서 `auth.getUser()`(Auth 서버 네트워크 왕복)를 쓰지 않는다.
 * `auth.getClaims()`는 프로젝트 비대칭 키로 액세스 토큰 서명을 **로컬 검증** →
 * 요청당 1 RTT 제거. 토큰 무효/민감 작업 등 불가피한 경우만 원격 검증.
 */
export async function getSessionUserId(): Promise<string | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims?.sub) return null;
  return data.claims.sub;
}

/**
 * 민감 작업(결제·본인인증·계정 변경)용 — 원격 검증 허용.
 * 일반 게임 액션은 `getSessionUserId()`를 쓸 것.
 */
export async function getVerifiedUserId(): Promise<string | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}
