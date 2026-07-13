/**
 * 미접속 닉네임 회수 cron — 매일 1회(KST 04:30 = UTC `30 19 * * *`, vercel.json).
 * 90일 이상 미접속 캐릭터의 닉네임을 기본형('대장장이'+난수)으로 초기화해 전역 유일
 * 닉네임의 이탈 계정 영구 점유를 방지. 상세 정책·경쟁 방어는 lib/game/nickname-reclaim.ts.
 * 멱등(회수 후엔 기본형이라 재대상 제외)·회당 상한 50. 인증 = CRON_SECRET / x-vercel-cron.
 */
import { isCronAuthorized } from '@/lib/auth/cron-auth';
import { reclaimInactiveNicknames } from '@/lib/game/nickname-reclaim';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function GET(req: Request) {
  if (!isCronAuthorized(req)) return new Response('forbidden', { status: 403 });
  try {
    const r = await reclaimInactiveNicknames();
    if (r.reclaimed > 0 || r.failed > 0) console.log('[nickname-reclaim]', r);
    return Response.json({ ok: r.failed === 0, ...r, kind: 'nickname-reclaim' });
  } catch (e) {
    console.error('[nickname-reclaim]', e);
    return Response.json(
      { ok: false, error: (e as Error).message, kind: 'nickname-reclaim' },
      { status: 500 },
    );
  }
}
