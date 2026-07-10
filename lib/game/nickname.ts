/**
 * 닉네임 정책 — 한글·영문·숫자만 / 2~8자 (글자 수 기준).
 *  - 허용 문자: A-Z, a-z, 0-9, 한글 완성형(가-힣)
 *  - min 2자 / max 8자 (한글/영문/숫자 모두 1자로 카운트)
 *  - 공백·기호·이모지·자모(ㄱㅏ) 분리 모두 차단
 *  - 기존 정책 초과 닉네임은 grandfathered(변경 시점에만 새 정책)
 */

export const NICKNAME_MIN_LEN = 2;
export const NICKNAME_MAX_LEN = 8;

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

/**
 * 사칭·혼동 방지 예약어 — **부분 일치** 차단(영문은 소문자 정규화 후 비교).
 * 비속어 필터가 아니라 운영 주체 사칭(운영자·관리자·GM 등)·서비스 공식 명의 혼동을 막는
 * 최소 목록. 기존 닉네임은 grandfathered — 변경/신규 시점에만 검사(파일 헤더 정책과 동일).
 * 닉네임 최대 8자라 9자+ 단어(administrator 등)는 등재 무의미 — 8자 이하만 유지.
 */
const RESERVED_SUBSTRINGS = [
  // 한글 — 운영 주체 사칭
  '운영자',
  '운영진',
  '운영팀',
  '관리자',
  '개발자',
  '매니저',
  '고객센터',
  '시스템',
  '공식',
  // 서비스 명의
  '인생강화',
  // 영문 — 소문자 비교(대소문자 우회 차단)
  'admin',
  'operator',
  'manager',
  'staff',
  'system',
  'official',
] as const;

/** 짧은 토큰은 **전체 일치만** — 부분 일치는 오차단('gm'⊂'kingman' 등)이 커서 제외. */
const RESERVED_EXACT = ['gm', 'cs', 'bot'] as const;

/** 예약어 포함 여부 — 소문자 정규화 후 부분/전체 일치 검사. */
export function hasReservedWord(nickname: string): boolean {
  const n = nickname.toLowerCase();
  if ((RESERVED_EXACT as readonly string[]).includes(n)) return true;
  return RESERVED_SUBSTRINGS.some((w) => n.includes(w));
}

/** server·client 공용 검증. trim 후 길이·문자·예약어 모두 체크. */
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
  if (hasReservedWord(trimmed)) {
    return { ok: false, reason: '사용할 수 없는 단어가 포함되어 있어요' };
  }
  return { ok: true };
}
