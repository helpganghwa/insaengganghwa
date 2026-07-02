import 'server-only';

import { createSupabaseServerClient } from './supabase-server';
import { TEST_ACCOUNTS, isCbtPaidHidden } from './test-accounts';

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
 * 현재 세션이 심사/검수 테스터 계정(ID/PW 로그인 cbt@·cbt2@·cbt3@)인지 — JWT email 클레임으로 판정.
 * 카카오 유저는 해당 이메일이 아니므로 false. CBT 게이팅(결제 콘텐츠 노출) 판정에 사용.
 */
export async function isReviewerAccount(): Promise<boolean> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error) return false;
  const email = String((data?.claims as { email?: string } | undefined)?.email ?? '').toLowerCase();
  return !!email && TEST_ACCOUNTS.some((a) => a.email.toLowerCase() === email);
}

/**
 * 이 유저에게 결제 콘텐츠(성장패스·상점 유료)를 숨겨야 하는가.
 * CBT 기간(isCbtPaidHidden) && 테스터 계정이 아님 → true. 정식 출시(플래그 off) 시 항상 false.
 */
export async function shouldHidePaidContent(): Promise<boolean> {
  if (!isCbtPaidHidden()) return false;
  return !(await isReviewerAccount());
}
