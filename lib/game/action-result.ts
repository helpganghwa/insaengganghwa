/**
 * 서버 액션 결과 계약 — 전 도메인 액션(강화·보급·레이드·우편·출석·배틀패스 등)의 **단일 진화점**.
 * 기존엔 각 actions.ts가 `{status:'error';code;message}` 타입과 err() 헬퍼를 각자 재정의했다.
 */

/** 실패 결과 — code(안정 식별자, 클라 분기용) + message(유저 노출 한국어). */
export type ErrorResult = { status: 'error'; code: string; message: string };

/** 성공(도메인별 payload T) 또는 실패의 합. */
export type ActionResult<T = unknown> = ({ status: 'success' } & T) | ErrorResult;

/**
 * 도메인 코드→메시지 맵을 바인딩해 `err(code)`를 만든다. 각 액션 파일:
 *   const err = makeErr(MSG);  // MSG: Record<코드, 한국어>
 *   return err('SLOT_BUSY');
 * 맵에 없는 코드는 **일반 안내 문구**로 떨어진다.
 *
 * ⚠ 종전엔 `?? code`라 맵에 없는 코드가 **영문 코드 그대로 유저 화면에 떴다**(정지 계정이 레이드를
 * 누르면 붉은 토스트에 `BANNED` 한 단어, 출석 수령 실패에 `NO_CHARACTER`). 유저 텍스트에 내부 코드를
 * 노출하지 않는다는 규칙(app/login/page.tsx의 loginErrorMessage와 같은 축)에 맞춘다. 코드 자체는
 * `code` 필드로 그대로 전달되므로 호출부가 분기하는 데는 지장이 없다(2026-09-12 검수).
 */
const FALLBACK_MESSAGE = '지금은 처리할 수 없어요. 잠시 후 다시 시도해 주세요.';

export function makeErr(msg: Record<string, string>) {
  return (code: string): ErrorResult => ({ status: 'error', code, message: msg[code] ?? FALLBACK_MESSAGE });
}
