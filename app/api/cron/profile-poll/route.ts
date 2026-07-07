/**
 * 프로필 생성 파이프라인 cron — PROFILE §2.
 *
 * 매 2분 실행 (Pixellab Pro mode ~6분이라 polling 2~3회).
 * 한 iteration:
 *   1. drainQueue() — 여유 슬롯(동시 5 - 활성)만큼 queued→발주(즉시 시작은 submit의 after()가,
 *      cron은 백스톱). 정체 스윕 포함.
 *   2. status='downloading' 최대 5건 → 폴링 → completed면 다운로드·AI 검토·분기
 *
 * 인증: CRON_SECRET Bearer 또는 x-vercel-cron 헤더 (공통 크론 인증 패턴, isCronAuthorized).
 */
import { isCronAuthorized } from '@/lib/auth/cron-auth';
import { pollAndProcessDownloading } from '@/lib/game/profile/pipeline';
import { drainQueue } from '@/lib/game/profile/pipeline-v3';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 90; // drain(최대 5 발주 POST) + Pro mode 폴링·8방향 다운로드·AI 검토 여유.

export async function GET(req: Request) {
  if (!isCronAuthorized(req)) return new Response('forbidden', { status: 403 });

  const t0 = Date.now();
  let enqueueResult: Awaited<ReturnType<typeof drainQueue>> | { error: string };
  try {
    enqueueResult = await drainQueue();
  } catch (e) {
    enqueueResult = { error: (e as Error).message };
  }

  let pollResult: Awaited<ReturnType<typeof pollAndProcessDownloading>> | { error: string };
  try {
    pollResult = await pollAndProcessDownloading(5);
  } catch (e) {
    pollResult = { error: (e as Error).message };
  }

  // enqueueResult.jobId 등 bigint 포함 → Response.json(JSON.stringify)이 직렬화 못 함.
  // bigint→string replacer로 안전 직렬화(크론 응답 500 방지).
  return new Response(
    JSON.stringify(
      { ms: Date.now() - t0, enqueue: enqueueResult, poll: pollResult },
      (_k, v) => (typeof v === 'bigint' ? v.toString() : v),
    ),
    { headers: { 'content-type': 'application/json' } },
  );
}
