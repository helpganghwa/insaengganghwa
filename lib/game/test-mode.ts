/**
 * 테스트 기간 보상 배율 플래그 — **환경변수 게이트, 기본 OFF(실운영 안전)**.
 *
 * `TEST_MODE=true` env일 때만 ×5 지급: 출석체크 · 일일 우편 보급 · 신규가입/새 서버 보너스.
 * env 미설정/그 외 값이면 ×1(정상 경제). **운영 서버엔 켜지 말 것** — 켜면 faucet 폭증.
 * 가입 보너스는 createCharacter(server-select.ts)가 이 상수로 지급(트리거 desync 없음).
 * server-only 로직에서만 참조(클라 번들 비노출)하므로 비-public 런타임 env로 읽는다.
 */
// env로만 제어 — CBT가 프로덕션(ganghwa.app)에서 돌아 NODE_ENV/VERCEL_ENV로 "CBT 프로덕션"과
// "출시 프로덕션"을 구분할 수 없으므로 환경 가드를 두지 않는다(두면 CBT 5배가 꺼짐).
// ⚠ 출시 시 안전장치 = 출시 체크리스트(TEST_MODE env 제거) + 아래 콜드스타트 경고 로그.
export const TEST_MODE = process.env.TEST_MODE === 'true';

/** 테스트 기간 보상 배율 — 출석체크·일일 우편·가입 보너스에 적용. */
export const TEST_REWARD_MULTIPLIER = TEST_MODE ? 5 : 1;

// 인스턴스당 1회 — 정식 출시 전 끄는 걸 잊지 않도록. 모듈 스코프 if만으로는 라우트별 청크
// 중복 번들/미들웨어 재평가로 매 요청 찍혀 warning 로그를 지배했음(실측 2026-07-13, 6h 1,800+건
// 대부분) → globalThis 플래그로 번들 중복과 무관하게 프로세스당 1회 보장.
const g = globalThis as { __testModeWarned?: boolean };
if (TEST_MODE && !g.__testModeWarned) {
  g.__testModeWarned = true;
  console.warn('⚠ [test-mode] ×5 보상 활성(TEST_MODE=true) — 정식 출시 전 env에서 반드시 제거할 것');
}
