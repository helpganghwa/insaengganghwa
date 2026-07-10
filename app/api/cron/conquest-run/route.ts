/**
 * 점령전 정산 cron — GUILD §5.8⑧. **KST 23:00** = UTC 14시대 5분 간격(vercel.json).
 * 23:00에 그날(오늘 KST) 전투를 결정론 산출해 conquest_battles에 **저장만**(published_at=NULL,
 * 소유권/우편 미적용). 유저 노출·발표는 24:00 conquest-chronicle(revealConquest)이 담당.
 * 멱등(zone×day UNIQUE). 인증 = CRON_SECRET / x-vercel-cron.
 */
import { isCronAuthorized } from '@/lib/auth/cron-auth';
import { openServerIds } from '@/lib/game/server-list';
import { runConquest } from '@/lib/game/guild/conquest/run';
import { generateAndStoreChronicle } from '@/lib/game/guild';
import { kstDateString } from '@/lib/kst';
import { beatCron } from '@/lib/cron/heartbeat';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(req: Request) {
  if (!isCronAuthorized(req)) return new Response('forbidden', { status: 403 });
  // 23:00(KST) 실행 → 오늘 KST 날짜가 곧 전투일. 결과는 저장만, 공개는 24:00.
  const battleDay = kstDateString(new Date());
  try {
    const results = [];
    // per-server 에러격리(감사 G1) — 한 서버 실패가 뒤 서버 처리를 막지 않도록 격리. 멱등이라
    // 다음 tick 재시도 안전. 하나라도 실패하면 ok=false+500으로 알림 보존.
    for (const sid of await openServerIds()) {
      try {
        results.push({ serverId: sid, ...(await runConquest(sid, battleDay)) });
        // 연대기 **사전 생성**(정각 공개 설계) — 정산 직후 23시대에 LLM 스토리를 미리 만들어
        // 저장한다(as-if-flipped 집계, chronicle.ts). 노출은 getChronicle의 읽기 게이트가
        // 자정에 시계 기준으로 개방 → 00:00:00 정각에 크론 지터 없이 보임. 멱등(행 있으면
        // skip)이라 다중 tick 안전. 실패는 무해 — 00시대 conquest-chronicle 백필이 생성.
        try {
          await generateAndStoreChronicle(battleDay, sid);
        } catch (ce) {
          console.warn('[conquest-run] chronicle pregen 실패(00시대 백필로 강등)', sid, ce);
        }
      } catch (se) {
        console.error('[conquest-run] server', sid, se);
        results.push({ serverId: sid, error: (se as Error).message });
      }
    }
    const ok = results.every((r) => !('error' in r));
    if (ok) await beatCron('conquest-run'); // 성공일 때만 — '실행됐으나 실패'를 dead-man이 감지하게
    return Response.json({ ok, battleDay, results, kind: 'conquest-run' }, { status: ok ? 200 : 500 });
  } catch (e) {
    console.error('[conquest-run]', e);
    return Response.json({ ok: false, error: (e as Error).message, kind: 'conquest-run' }, { status: 500 });
  }
}
