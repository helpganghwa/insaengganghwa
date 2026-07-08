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
 * 맵에 없는 코드는 code 자체를 메시지로(안전 폴백).
 */
export function makeErr(msg: Record<string, string>) {
  return (code: string): ErrorResult => ({ status: 'error', code, message: msg[code] ?? code });
}
