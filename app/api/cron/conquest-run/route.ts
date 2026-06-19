/**
 * 점령전 정산 cron — GUILD §5.8⑧. **KST 23:00** = UTC 14시대 5분 간격(vercel.json).
 * 23:00에 그날(오늘 KST) 전투를 결정론 산출해 conquest_battles에 **저장만**(published_at=NULL,
 * 소유권/우편 미적용). 유저 노출·발표는 24:00 conquest-chronicle(revealConquest)이 담당.
 * 멱등(zone×day UNIQUE). 인증 = CRON_SECRET / x-vercel-cron.
 */
import { isCronAuthorized } from '@/lib/auth/cron-auth';
import { openServerIds } from '@/lib/game/server-list';
import { runConquest } from '@/lib/game/guild/conquest/run';
import { kstDateString } from '@/lib/kst';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(req: Request) {
  if (!isCronAuthorized(req)) return new Response('forbidden', { status: 403 });
  // 23:00(KST) 실행 → 오늘 KST 날짜가 곧 전투일. 결과는 저장만, 공개는 24:00.
  const battleDay = kstDateString(new Date());
  try {
    const results = [];
    for (const sid of await openServerIds()) results.push({ serverId: sid, ...(await runConquest(sid, battleDay)) });
    const r = { results };
    return Response.json({ ok: true, battleDay, ...r, kind: 'conquest-run' });
  } catch (e) {
    console.error('[conquest-run]', e);
    return Response.json({ ok: false, error: (e as Error).message, kind: 'conquest-run' }, { status: 500 });
  }
}
