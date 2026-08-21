/**
 * 오픈 직전 테스트 데이터 청소(2026-08-21, 1회성) — 8/24 KST 10:15 발화(vercel.json
 * '15 1 24 8 *'). 봉인 기간(8/21~24 10:00) 심사·어드민 테스트 흔적을 서버 오픈(10:30)
 * 전에 자동 제거한다 — 사용자 요구: "오픈 전 실서버 테스트 가능 + 오픈 월드는 깨끗하게".
 *
 * 이중 가드: cron 표현식은 매년 8/24에 발화하므로, 2026-08-24 KST 10:00~10:30 창
 * 밖에서는 no-op. ⚠ 오픈 후 정리 커밋에서 vercel.json 항목과 함께 제거 예정.
 */
import { isCronAuthorized } from '@/lib/auth/cron-auth';
import { resetTestAccountsGameData } from '@/lib/game/account/reset-test-data';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const WINDOW_START = Date.parse('2026-08-24T10:00:00+09:00');
const WINDOW_END = Date.parse('2026-08-24T10:30:00+09:00');

export async function GET(req: Request) {
  if (!isCronAuthorized(req)) return new Response('forbidden', { status: 403 });
  const now = Date.now();
  if (now < WINDOW_START || now > WINDOW_END) {
    return Response.json({ ok: true, skipped: 'out-of-window', kind: 'preopen-cleanup' });
  }
  const r = await resetTestAccountsGameData();
  console.log('[preopen-cleanup] 테스트 데이터 청소 완료', r);
  return Response.json({ ok: true, ...r, kind: 'preopen-cleanup' });
}
