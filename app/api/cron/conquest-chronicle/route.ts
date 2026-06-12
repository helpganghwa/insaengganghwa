/**
 * 세계 연대기 생성 cron — 점령전(KST 23:00~23:59) 종료 뒤 **자정(KST 00:00)**에 매일 1회.
 * 자정에 돌므로 대상 날짜 = 방금 끝난 전투일 = **어제(KST)**. kst_day 멱등(이미 있으면 skip).
 * 스케줄: vercel.json UTC 15시대 5분 간격(= KST 00시대) — 배포 겹침 대비 윈도.
 * 인증: CRON_SECRET Bearer(설정 시) — isCronAuthorized.
 */
import { isCronAuthorized } from '@/lib/auth/cron-auth';
import { generateAndStoreChronicle } from '@/lib/game/guild';
import { openServerIds } from '@/lib/game/server-list';
import { kstDateString } from '@/lib/kst';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: Request) {
  if (!isCronAuthorized(req)) return new Response('forbidden', { status: 403 });
  // 자정(KST 00시대) 실행 → 전투가 일어난 어제 날짜를 대상으로 생성(24h 전 KST 날짜).
  const kstDay = kstDateString(new Date(Date.now() - 24 * 60 * 60 * 1000));
  try {
    const results = [];
    for (const sid of await openServerIds()) results.push({ serverId: sid, ...(await generateAndStoreChronicle(kstDay, sid)) });
    const r = { results };
    return Response.json({ ok: true, kstDay, ...r, kind: 'conquest-chronicle' });
  } catch (e) {
    console.error('[conquest-chronicle]', e);
    return Response.json(
      { ok: false, kstDay, error: (e as Error).message, kind: 'conquest-chronicle' },
      { status: 500 },
    );
  }
}
