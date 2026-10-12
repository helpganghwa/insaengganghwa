/**
 * 로그인 화면의 서버 선택 쿠키(login_srv, 10분) — 클라 전용 헬퍼. 컴포넌트 밖에 둔 이유: React Compiler가 컴포넌트 안의
 * `document.cookie = …`를 "컴포넌트 밖 값의 변경"으로 보고 그 컴포넌트를 건너뛴다(코드 품질 조사 10-12). 동작은 같다.
 */
export function writeLoginServerCookie(serverId: number): void {
  const secure = location.protocol === 'https:' ? '; secure' : '';
  document.cookie = `login_srv=${serverId}; path=/; max-age=600; samesite=lax${secure}`;
}
