/**
 * 클라이언트 문자열 ID를 bigint로 안전 변환 — 비수치 입력은 throw 대신 null.
 * 호출부가 null을 "잘못된 ID"로 반려해 잘못된 입력에 500 나는 것을 막는다.
 */
export function safeBigInt(s: string): bigint | null {
  try {
    return BigInt(s);
  } catch {
    return null;
  }
}
