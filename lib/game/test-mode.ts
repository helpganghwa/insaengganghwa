/**
 * 테스트 기간 보상 배율 플래그 — **환경변수 게이트, 기본 OFF(실운영 안전)**.
 *
 * `TEST_MODE=true` env일 때만 ×5 지급: 출석체크 · 일일 우편 보급 · 신규가입/새 서버 보너스.
 * env 미설정/그 외 값이면 ×1(정상 경제). **운영 서버엔 켜지 말 것** — 켜면 faucet 폭증.
 * 가입 보너스는 createCharacter(server-select.ts)가 이 상수로 지급(트리거 desync 없음).
 * server-only 로직에서만 참조(클라 번들 비노출)하므로 비-public 런타임 env로 읽는다.
 */
export const TEST_MODE = process.env.TEST_MODE === 'true';

/** 테스트 기간 보상 배율 — 출석체크·일일 우편·가입 보너스에 적용. */
export const TEST_REWARD_MULTIPLIER = TEST_MODE ? 5 : 1;
