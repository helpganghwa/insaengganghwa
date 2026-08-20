/**
 * warm cron(매분) — 크론 dead-man 워치독 본체.
 *
 * 이름이 'warm'인 이유(역사): 콜드 DB 커넥션이 레이아웃 쿼리를 5s 가드 밖으로 밀어 504가
 * 나던 시기(2026-05-28)의 웜핑 크론이었다. 지금은 워치독의 하트비트 조회(getStaleCrons)와
 * beatCron upsert가 매분 같은 풀로 DB 왕복을 하므로 별도 select 1 웜핑이 필요 없고, 페이지
 * 함수 self-fetch도 Fluid 인스턴스 재사용 + 실트래픽으로 대체됐다(2026-08-20 감사에서 제거 —
 * 월 ~17K 함수호출 순비용). 크론명은 heartbeat 등재명·vercel.json과 묶여 있어 유지한다.
 *
 * 인증: CRON_SECRET Bearer 또는 x-vercel-cron 헤더 (profile-poll 패턴).
 */
import { isCronAuthorized } from '@/lib/auth/cron-auth';
import { beatCron, getStaleCrons, markStaleAlerted } from '@/lib/cron/heartbeat';
import { raiseOpsAlert } from '@/lib/ops/alert';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 20;

export async function GET(req: Request) {
  if (!isCronAuthorized(req)) return new Response('forbidden', { status: 403 });

  const t0 = Date.now();
  const out: Record<string, unknown> = {};

  // 크론 dead-man 워치독 — 매분 도는 warm이 다른 크론의 정지(허용 간격 초과)를 감지해
  //    아직 알리지 않은 것만 어드민 푸시/웹훅. warm 자신이 죽으면(=총체적 크론 정지) 여기서
  //    못 알리므로, 외부 uptime 모니터가 최종 백스톱(대시보드도 방문 시 표시).
  //    ⚠ 워치독이 던지면 여기서 삼켜지는데(응답 본문은 아무도 안 읽는다) warm은 자기 자신의
  //    워치독이라 감시 두 층이 동시에 조용히 '정상'으로 보인다. 그래서 결과를 beat detail에
  //    실어 어드민 대시보드·cron_heartbeats 조회에서 '감시가 깨졌다'가 보이게 한다.
  let watchdog: string;
  try {
    const stale = await getStaleCrons(Date.now());
    const fresh = stale.filter((s) => !s.alerted);
    if (fresh.length > 0) {
      const lines = fresh
        .map((s) => `• ${s.name} — ${s.lastSuccessAt ? `${Math.round(s.ageMs / 60000)}분째 미성공` : '한 번도 성공 없음'}`)
        .join('\n');
      await raiseOpsAlert(`크론 정지 감지 ${fresh.length}건`, lines);
      await markStaleAlerted(fresh.map((s) => s.name));
    }
    out.stale = stale.map((s) => s.name);
    watchdog = `stale=${stale.length}${fresh.length > 0 ? ` alerted=${fresh.length}` : ''}`;
  } catch (e) {
    out.stale = (e as Error).message;
    watchdog = `watchdog:ERR ${(e as Error).message.slice(0, 120)}`;
  }

  // beat 호출은 조건 없이 유지 — warm이 beat를 멈추면 /api/health/deep이 503(cron-system-down)을
  // 내는데, 워치독 함수 하나가 깨진 것과 크론 시스템 전체 정지는 다른 사건이다(오알림 방지).
  await beatCron('warm', watchdog);
  return Response.json({ ms: Date.now() - t0, ...out });
}
