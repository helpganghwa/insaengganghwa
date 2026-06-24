/**
 * Cron 요청 인증 — 모든 `/api/cron/*` 라우트 공용.
 *
 * 보안 모델(중요):
 * - **CRON_SECRET 설정됨** → `Authorization: Bearer ${CRON_SECRET}` 일치만 허용.
 *   Vercel cron은 CRON_SECRET env가 있으면 이 헤더를 자동 첨부하므로 정상 동작.
 *   `x-vercel-cron`·`user-agent` 표식은 **외부에서 위조 가능**하므로 이 모드에선 불신(바이패스 차단).
 * - **CRON_SECRET 미설정 + 프로덕션** → fail-closed(전면 거부). 위조 가능한 헤더 폴백을
 *   운영에 열어두지 않는다. 프로덕션은 CRON_SECRET을 반드시 설정해야 cron이 동작한다.
 * - **CRON_SECRET 미설정 + 비프로덕션(로컬/프리뷰)** → 폴백으로 `x-vercel-cron` /
 *   `user-agent: vercel-cron/*` 허용(개발 편의). 위조 가능하나 운영 데이터 아님.
 */
export function isCronAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    // 시크릿 설정 시 — Bearer 일치만. 위조 가능한 헤더 폴백은 의도적으로 무시.
    return req.headers.get('authorization') === `Bearer ${secret}`;
  }
  // 프로덕션에서 시크릿 미설정 = fail-closed. 무인증 폴백을 운영에 열지 않는다.
  if (process.env.NODE_ENV === 'production') return false;
  // 비프로덕션 폴백 — 덜 안전하나 운영 데이터 아님(개발/프리뷰 편의).
  if (req.headers.get('x-vercel-cron')) return true;
  return (req.headers.get('user-agent') ?? '').startsWith('vercel-cron/');
}
