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
  // 'true' 외에 '1'/'yes'/'on'도 허용 — env에 1로 넣어도 동작(흔한 실수 흡수).
  const v = (process.env.ALLOW_TEST_LOGIN ?? '').trim().toLowerCase();
  return v === 'true' || v === '1' || v === 'yes' || v === 'on';
}

/**
 * 심사 제출용 계정(ID/PW 입력 로그인) — 포트원·게임물 등급심의에 기재하는 단일 자격증명.
 * 심사관은 카카오 없이 이 ID/PW로 로그인. env ALLOW_TEST_LOGIN=true일 때만 폼 노출.
 * 외우기 쉬운 값(CBT 테마) — 게이트가 env라 단순값으로 충분.
 */
export const REVIEW_ACCOUNT_EMAIL = 'cbt@ganghwa.app';
export const REVIEW_ACCOUNT_PASSWORD = 'cbt123456';

/** 고정 심사/검수 계정 3개 — 심사관 제출용 + 길드/친구/대난투 등 다인 기능 검수용. 전부 동일 비밀번호. */
export const TEST_ACCOUNTS: { email: string; label: string }[] = [
  { email: 'cbt@ganghwa.app', label: '심사용 1' },
  { email: 'cbt2@ganghwa.app', label: '심사용 2' },
  { email: 'cbt3@ganghwa.app', label: '심사용 3' },
];

/** 모든 심사/검수 계정 공용 비밀번호(cbt123456). */
export function passwordForTestAccount(_email: string): string {
  return REVIEW_ACCOUNT_PASSWORD;
}
