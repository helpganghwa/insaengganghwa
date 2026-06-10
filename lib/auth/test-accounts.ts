import 'server-only';

/**
 * 테스트 로그인 — 카카오 단독 인증이라 개발/검수 단계에서 계정 생성이 불가한 문제 임시 해소.
 *
 * ⚠ 실운영 전환 시 제거: env `ALLOW_TEST_LOGIN`을 끄면(미설정/!= 'true') 버튼·액션 모두 비활성.
 *   코드까지 지우려면 이 파일 + actions.ts의 signInWithTestAccount + login 페이지 test 분기 삭제.
 *
 * 동작: `/login?test=true`에서 카카오 버튼 대신 테스트 계정 버튼 노출 →
 *   admin API로 해당 email/password Supabase Auth 유저를 (없으면) 생성 → signInWithPassword.
 *   프로필·스타터·거주지는 handle_new_user / set_default_residence 트리거가 자동 생성.
 */
export function isTestLoginEnabled(): boolean {
  return process.env.ALLOW_TEST_LOGIN === 'true';
}

/** 고정 테스트 계정 — 길드/친구/대난투 등 다인 기능 검수용 3개. */
export const TEST_ACCOUNTS: { email: string; label: string }[] = [
  { email: 'tester1@insaeng.test', label: '테스터 1' },
  { email: 'tester2@insaeng.test', label: '테스터 2' },
  { email: 'tester3@insaeng.test', label: '테스터 3' },
];

/** 전 테스트 계정 공용 비밀번호(게이트가 env라 단순 고정으로 충분). */
export const TEST_PASSWORD = 'insaeng-test-9f3a2b';
