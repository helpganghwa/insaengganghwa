/**
 * Cron 요청 인증 — 모든 `/api/cron/*` 라우트 공용.
 *
 * 보안 모델(중요):
 * - **CRON_SECRET 설정됨** → `Authorization: Bearer ${CRON_SECRET}` 일치만 허용.
 *   Vercel cron은 CRON_SECRET env가 있으면 이 헤더를 자동 첨부하므로 정상 동작.
 *   `x-vercel-cron`·`user-agent` 표식은 **외부에서 위조 가능**하므로 이 모드에선 불신(바이패스 차단).
 * - **CRON_SECRET 미설정** → 폴백으로 `x-vercel-cron` / `user-agent: vercel-cron/*` 허용.
 *   미설정 환경에서 cron이 마비되지 않게 하는 안전망일 뿐 — ⚠ **프로덕션은 반드시 CRON_SECRET을
 *   설정**해 폴백 경로(누구나 헤더만 붙이면 통과)를 닫을 것.
 */
export function isCronAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    // 시크릿 설정 시 — Bearer 일치만. 위조 가능한 헤더 폴백은 의도적으로 무시.
    return req.headers.get('authorization') === `Bearer ${secret}`;
  }
  // CRON_SECRET 미설정 — 덜 안전한 폴백. 프로덕션에서 즉시 설정 권장.
  if (req.headers.get('x-vercel-cron')) return true;
  return (req.headers.get('user-agent') ?? '').startsWith('vercel-cron/');
}
