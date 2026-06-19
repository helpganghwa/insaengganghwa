/**
 * 점령전 정산 cron — GUILD §5.8⑧. **KST 자정(00시대)** = UTC 15시대 5분 간격(vercel.json).
 * 자정에 돌며 대상 = **직전 전투일(어제 KST)** — 배치 마감(전날 23:00)·결과 발표(자정)를 일치시켜
 * 소유권·우편을 세계 연대기와 같은 자정에 함께 노출. 경합 구역(공격 배치 ≥1) 결정론 정산.
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
  // 자정(KST 00시대) 실행 → 전투가 끝난 어제 날짜를 정산(24h 전 KST 날짜). chronicle과 동일 기준.
  const battleDay = kstDateString(new Date(Date.now() - 24 * 60 * 60 * 1000));
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
