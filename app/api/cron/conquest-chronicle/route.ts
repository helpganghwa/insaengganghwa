/**
 * 점령전 정산+세계 연대기 생성 cron — **자정(KST 00시대)**에 매일 1회.
 * 대상 날짜 = 방금 끝난 전투일 = **어제(KST)**. kst_day 멱등(이미 있으면 skip).
 * 연대기 서술 전에 해당 서버의 어제 전투 정산을 먼저 보장한다(runConquest 멱등) — 자정에
 * conquest-run과 동시 실행돼도 zone×day UNIQUE로 중복 없이 안전. 이로써 narrate가
 * 미정산 데이터를 읽는 레이스를 차단(소유권·우편·연대기 모두 자정 발표 일치).
 * 스케줄: vercel.json UTC 15시대 5분 간격(= KST 00시대) — 배포 겹침 대비 윈도.
 * 인증: CRON_SECRET Bearer(설정 시) — isCronAuthorized.
 */
import { isCronAuthorized } from '@/lib/auth/cron-auth';
import { generateAndStoreChronicle } from '@/lib/game/guild';
import { runConquest } from '@/lib/game/guild/conquest/run';
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
    for (const sid of await openServerIds()) {
      // narrate 전에 어제 전투 정산 보장(멱등) — 미정산 상태에서 빈 연대기 생성 방지.
      const settle = await runConquest(sid, kstDay);
      results.push({ serverId: sid, settled: settle.resolved, ...(await generateAndStoreChronicle(kstDay, sid)) });
    }
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
