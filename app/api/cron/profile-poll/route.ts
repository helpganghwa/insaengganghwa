/**
 * 프로필 생성 파이프라인 cron — PROFILE §2.
 *
 * 매 2분 실행 (Pixellab Pro mode ~6분이라 polling 2~3회).
 * 한 iteration:
 *   1. status='queued' 1건 → Pixellab v2 POST → 'downloading'
 *   2. status='downloading' 최대 5건 → 폴링 → completed면 다운로드·AI 검토·분기
 *
 * 인증: CRON_SECRET Bearer 또는 x-vercel-cron 헤더 (resolve-enhance 패턴).
 */
import { enqueueOnePixellab, pollAndProcessDownloading } from '@/lib/game/profile/pipeline';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60; // Pro mode 처리·8방향 다운로드·AI 검토 시간 여유.

function isAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get('authorization');
    if (auth === `Bearer ${secret}`) return true;
  }
  if (req.headers.get('x-vercel-cron')) return true;
  const ua = req.headers.get('user-agent') ?? '';
  if (ua.startsWith('vercel-cron/')) return true;
  return false;
}

export async function GET(req: Request) {
  if (!isAuthorized(req)) return new Response('forbidden', { status: 403 });

  const t0 = Date.now();
  let enqueueResult: Awaited<ReturnType<typeof enqueueOnePixellab>> | { kind: 'error'; error: string };
  try {
    enqueueResult = await enqueueOnePixellab();
  } catch (e) {
    enqueueResult = { kind: 'error', error: (e as Error).message };
  }

  let pollResult: Awaited<ReturnType<typeof pollAndProcessDownloading>> | { error: string };
  try {
    pollResult = await pollAndProcessDownloading(5);
  } catch (e) {
    pollResult = { error: (e as Error).message };
  }

  return Response.json({
    ms: Date.now() - t0,
    enqueue: enqueueResult,
    poll: pollResult,
  });
}
