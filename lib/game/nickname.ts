/**
 * 닉네임 정책 — 한글·영문·숫자만 / 2~12자 (글자 수 기준).
 *  - 허용 문자: A-Z, a-z, 0-9, 한글(가-힣)
 *  - min 2자 / max 12자 (한글/영문/숫자 모두 1자로 카운트)
 *  - 공백·기호·이모지·자모(ㄱㅏ) 분리 모두 차단
 *  - max 12자는 자동 부여 한글 닉네임(동사+색상+명사, 최대 11자)을 수용하기 위한 한도
 *  - 기존 정책 초과 닉네임은 grandfathered(변경 시점에만 새 정책)
 */

export const NICKNAME_MIN_LEN = 2;
export const NICKNAME_MAX_LEN = 10;

/** 허용 문자: 영문 대소문자 / 숫자 / 한글 완성형(가-힣). 자모·기호·공백·이모지 차단. */
export const NICKNAME_CHAR_REGEX = /^[A-Za-z0-9가-힣]+$/;

/** 글자 수 (Unicode code point) — 서로게이트 페어·한글 모두 1자. */
export function nicknameLen(s: string): number {
  return [...s].length;
}

/** 입력 중 허용 외 문자 즉시 strip + 최대 길이 컷. UI onChange에서 사용. */
export function sanitizeNicknameInput(raw: string): string {
  // 허용 외 문자 제거(공백·기호·자모·이모지 등).
  const filtered = raw.replace(/[^A-Za-z0-9가-힣]/g, '');
  // 최대 길이 컷 — code-point 단위로 잘라 한글 절반 안 잘림.
  const chars = [...filtered];
  if (chars.length > NICKNAME_MAX_LEN) return chars.slice(0, NICKNAME_MAX_LEN).join('');
  return filtered;
}

export type NicknameValidation = { ok: true } | { ok: false; reason: string };

/** server·client 공용 검증. trim 후 길이·문자 모두 체크. */
export function validateNickname(raw: string): NicknameValidation {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return { ok: false, reason: '닉네임을 입력해 주세요' };
  if (!NICKNAME_CHAR_REGEX.test(trimmed)) {
    return { ok: false, reason: '한글·영문·숫자만 사용할 수 있어요' };
  }
  const len = nicknameLen(trimmed);
  if (len < NICKNAME_MIN_LEN) {
    return { ok: false, reason: `닉네임은 최소 ${NICKNAME_MIN_LEN}자입니다` };
  }
  if (len > NICKNAME_MAX_LEN) {
    return { ok: false, reason: `닉네임은 최대 ${NICKNAME_MAX_LEN}자입니다` };
  }
  return { ok: true };
}
