/**
 * 닉네임 정책 — 2~12 byte (한글 1자=2byte, 영문/숫자/그 외 1byte).
 *  - 한글 max 6자, 영문/숫자 max 12자, 혼합 자유 (총 byte ≤ 12)
 *  - min 2 byte (한글 1자 또는 영문 2자)
 *  - 헤더(390 컬럼) 우측 닉네임 영역 폭과 정합 — truncate/말줄임 미사용
 *  - 기존 16자 닉네임은 grandfathered(변경 시점에 새 정책 적용)
 *
 * SCREEN-ANALYSIS §1.3 사용자 결정(2026-05-25). 한국 게임 표준(메이플·쿠키런 12자) 정렬.
 */

export const NICKNAME_MIN_BYTES = 2;
export const NICKNAME_MAX_BYTES = 12;

/** 닉네임 byte 길이 — 한글·CJK·이모지 2byte, ASCII 1byte. UI 입력 카운터에 사용. */
export function nicknameByteLen(s: string): number {
  let n = 0;
  for (const ch of s) {
    n += ch.charCodeAt(0) > 127 ? 2 : 1;
  }
  return n;
}

export type NicknameValidation = { ok: true } | { ok: false; reason: string };

/** trim 후 검증. 빈 문자열·trailing space 모두 거름. */
export function validateNickname(raw: string): NicknameValidation {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return { ok: false, reason: '닉네임을 입력해 주세요' };
  const bytes = nicknameByteLen(trimmed);
  if (bytes < NICKNAME_MIN_BYTES) {
    return { ok: false, reason: '닉네임이 너무 짧아요 (최소 한글 1자 / 영문 2자)' };
  }
  if (bytes > NICKNAME_MAX_BYTES) {
    return { ok: false, reason: '닉네임이 너무 길어요 (최대 한글 6자 / 영문 12자)' };
  }
  // 줄바꿈·탭 등 공백 문자 차단 (헤더 한 줄 표시).
  if (/[\r\n\t]/.test(trimmed)) {
    return { ok: false, reason: '닉네임에 줄바꿈·탭은 사용할 수 없어요' };
  }
  return { ok: true };
}
