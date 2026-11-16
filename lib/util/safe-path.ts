/**
 * 상대 경로 검증 — 리다이렉트·소프트 이동의 목적지로 써도 같은 출처에 머무는 경로만 통과(열린 리다이렉트 방지).
 * 서버(/auth/switch-server의 next)와 클라(PushAutoSync)가 같은 규칙을 쓴다(3차 검사 E8·A2-N6 — 두 곳의 검사가 달라
 * 클라에서는 `/\t/evil.com`이 통과했다. WHATWG URL은 탭·개행을 지우고 `//evil.com`으로 읽는다).
 *
 *  - `/`로 시작하고 두 번째 글자가 `/`·`\`가 아니어야 한다(`//host`·`/\host` = 프로토콜 상대 경로).
 *  - 공백류(탭·개행 포함)·백슬래시가 어디에도 없어야 한다.
 *  - 인증 라우트(`/auth/*`)로는 보내지 않는다 — 전환 라우트 자신(재귀)·GET 로그아웃. 정규화한 경로로 본다.
 * 서버 쪽은 이 검사 뒤에도 `new URL(path, origin).origin === origin`을 한 번 더 대조한다.
 */
export const SAFE_PATH_MAX_LEN = 2048;

export function safeRelativePath(raw: string | null | undefined): string | null {
  if (!raw || raw.length > SAFE_PATH_MAX_LEN) return null;
  if (!/^\/(?![/\\])[^\s\\]*$/.test(raw)) return null;
  // 인증 라우트(/auth/*)로는 보내지 않는다 — 전환 라우트 자신(재귀)과 GET 로그아웃. 점(.)·인코딩으로 우회하지
  // 못하게 URL이 정규화한 경로로 본다(11-16 검수 C11: `/./auth/switch-server`가 통과했다).
  let path: string;
  try {
    path = decodeURIComponent(new URL(raw, 'https://x.invalid').pathname).toLowerCase();
  } catch {
    return null;
  }
  if (path === '/auth' || path.startsWith('/auth/')) return null;
  return raw;
}
