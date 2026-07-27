import 'server-only';

/**
 * 심사/검수용 자격증명(ID/PW) 로그인 — 카카오 단독 인증이라 스토어·게임위 심사관이
 * 계정 없이 로그인할 수 없는 문제 해소.
 *
 * ✅ **상시 활성**(env 게이트 없음, 사용자 결정 2026-07-09): 출시 후에도 재심의 대응을 위해
 *   항상 열어둔다. 로그인은 `/login?test=true` 폼 + signInWithCredentials(사전 등록
 *   TEST_ACCOUNTS email + 비번)만 통과 — env로 켜고 끄지 않는다.
 * ⚠ 과거 `ALLOW_TEST_LOGIN` env는 폐지(2026-07-27). 결제 개방은 아래 PAYMENTS_OPEN이 담당하며
 *   테스트 로그인과 완전히 분리됐다.
 */

/**
 * 유료 콘텐츠(성장패스·상점 유료·챌린지 유료보상)를 일반 유저에게 숨길지 = 결제 개방 스위치.
 * env `PAYMENTS_OPEN` — **기본 미설정 = 숨김(안전측)**, 정식 출시 시 `PAYMENTS_OPEN=true`로 전 유저 개방.
 * ⚠ 테스트 로그인과 무관(과거 ALLOW_TEST_LOGIN 커플링 폐지). 테스터 계정은 이 값과 별개로
 *   shouldHidePaidContent에서 항상 결제 노출(심사용).
 */
export function isCbtPaidHidden(): boolean {
  // 'true' 외 '1'/'yes'/'on'도 개방으로 허용(흔한 env 실수 흡수). 그 외/미설정 = 숨김.
  const v = (process.env.PAYMENTS_OPEN ?? '').trim().toLowerCase();
  const open = v === 'true' || v === '1' || v === 'yes' || v === 'on';
  return !open;
}

/**
 * 심사 제출용 계정(ID/PW 입력 로그인) — 포트원·게임물 등급심의에 기재하는 단일 자격증명.
 * 심사관은 카카오 없이 이 ID/PW로 로그인(폼은 `/login?test=true`에서 상시 노출).
 * 외우기 쉬운 값(CBT 테마).
 */
export const REVIEW_ACCOUNT_EMAIL = 'cbt@ganghwa.app';
export const REVIEW_ACCOUNT_PASSWORD = 'cbt123456';

/** 고정 심사/검수 계정 3개 — 심사관 제출용 + 길드/친구/대난투 등 다인 기능 검수용. 전부 동일 비밀번호. */
export const TEST_ACCOUNTS: { email: string; label: string }[] = [
  { email: 'cbt@ganghwa.app', label: '심사용 1' },
  { email: 'cbt2@ganghwa.app', label: '심사용 2' },
  { email: 'cbt3@ganghwa.app', label: '심사용 3' },
  { email: 'cbt4@ganghwa.app', label: '심사용 4' },
  { email: 'cbt5@ganghwa.app', label: '심사용 5' },
];

/** 모든 심사/검수 계정 공용 비밀번호(cbt123456). */
export function passwordForTestAccount(_email: string): string {
  return REVIEW_ACCOUNT_PASSWORD;
}
