/**
 * 실운영 전 테스트 기간 플래그.
 *
 * 테스트 기간 동안 ×5로 지급되는 보상: 출석체크 · 일일 우편 보급 · 신규가입/새 서버 보너스.
 * - 모두 아래 배율 상수로 적용(false 시 ×1 자동 원복).
 * - 가입 보너스는 0067 이후 DB 트리거가 아니라 createCharacter(server-select.ts)가 지급하므로
 *   이 상수에 연동된다(트리거 하드코딩 desync 없음). 기본값 1000💎 / 슬롯당 10개.
 */
export const TEST_MODE = true;

/** 테스트 기간 보상 배율 — 출석체크·일일 우편·가입 보너스에 적용. */
export const TEST_REWARD_MULTIPLIER = TEST_MODE ? 5 : 1;
