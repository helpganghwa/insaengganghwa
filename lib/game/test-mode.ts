/**
 * 실운영 전 테스트 기간 플래그. 해제 시 false + 0007 원복 SQL 재실행.
 *
 * - 신규가입 보너스(다이아 10000 + 보급상자 종류별 100개)는 DB trigger(0007)가 적용.
 * - 출석체크 10배는 본 상수가 적용(lib/game/checkin/claim.ts).
 */
export const TEST_MODE = true;

/** 출석체크 보상 배율 — TEST_MODE 시 ×10. */
export const CHECKIN_REWARD_MULTIPLIER = TEST_MODE ? 10 : 1;
