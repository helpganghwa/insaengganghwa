import { config } from 'dotenv';

// Vitest 전역 setup — .env.local 로드(DIRECT_URL·TEST_USER_ID 등).
config({ path: '.env.local' });
config({ path: '.env', override: false });

if (!process.env.TEST_USER_ID) {
  console.warn(
    '[tests] TEST_USER_ID 미설정 — DB 통합 테스트는 skip. .env.local에 추가하려면\n' +
      '  TEST_USER_ID=<실제 가입한 테스트 계정 UUID>\n' +
      '(profiles는 auth.users FK라 신규 생성 불가 — 카카오 로그인으로 만든 계정 ID 사용)',
  );
}
