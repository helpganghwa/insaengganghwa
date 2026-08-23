/**
 * 오픈 직전 테스트 데이터 청소(2026-08-21, 1회성) — 8/24 KST 10:00·10:10 발화(vercel.json
 * '0,10 1 24 8 *' — 멱등이라 2틱=재시도. 사용자 지시로 10:18/28→10:00/10으로 앞당김,
 * 그 시각 유저 0이라 타 크론과의 분 충돌은 무시 가능). 봉인 기간(8/21~24 10:00) 심사·
 * 어드민 테스트 흔적을 서버 오픈(10:30) 전에 자동 제거한다.
 *
 * 이중 가드: cron 표현식은 매년 8/24에 발화하므로, 2026-08-24 KST 10:00~10:30 창
 * 밖에서는 no-op. ⚠ 오픈 후 정리 커밋에서 vercel.json 항목과 함께 제거 예정.
 */
import { isCronAuthorized } from '@/lib/auth/cron-auth';
import { beatCron } from '@/lib/cron/heartbeat';
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
  // 연 1회 단발 크론 — 실패하면 두 번째 기회가 없다. 동시 발화 크론(settle-raid 등)과의
  // 락 경합 등 일시 오류에 1회 재시도(전수 감사 2026-08-21, 발화 분은 :18/:28 2틱).
  try {
    const r = await resetTestAccountsGameData();
    console.log('[preopen-cleanup] 테스트 데이터 청소 완료', r);
    await beatCron('preopen-cleanup', `users=${r.users} guilds=${r.guilds}`).catch(() => {});
    return Response.json({ ok: true, ...r, kind: 'preopen-cleanup' });
  } catch (e) {
    console.error('[preopen-cleanup] 1차 실패 — 5초 후 재시도', e);
    await new Promise((res) => setTimeout(res, 5_000));
    const r = await resetTestAccountsGameData();
    console.log('[preopen-cleanup] 재시도 성공', r);
    await beatCron('preopen-cleanup', `retried users=${r.users}`).catch(() => {});
    return Response.json({ ok: true, ...r, kind: 'preopen-cleanup', retried: true });
  }
}
