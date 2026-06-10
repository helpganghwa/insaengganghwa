/**
 * 세계 연대기 생성 cron — 점령전 전투 종료 후 KST 12:00 발표와 함께 매일 1회.
 * 점령전 창(KST 11:00~11:59) 종료 뒤 실행. kst_day 멱등(이미 있으면 skip).
 * 스케줄: vercel.json UTC 03시대 5분 간격(= KST 12시대) — 배포 겹침 대비 윈도.
 * 인증: CRON_SECRET Bearer(설정 시) — isCronAuthorized.
 */
import { isCronAuthorized } from '@/lib/auth/cron-auth';
import { generateAndStoreChronicle } from '@/lib/game/guild';
import { kstDateString } from '@/lib/kst';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: Request) {
  if (!isCronAuthorized(req)) return new Response('forbidden', { status: 403 });
  const kstDay = kstDateString();
  try {
    const r = await generateAndStoreChronicle(kstDay);
    return Response.json({ ok: true, kstDay, ...r, kind: 'conquest-chronicle' });
  } catch (e) {
    console.error('[conquest-chronicle]', e);
    return Response.json(
      { ok: false, kstDay, error: (e as Error).message, kind: 'conquest-chronicle' },
      { status: 500 },
    );
  }
}
