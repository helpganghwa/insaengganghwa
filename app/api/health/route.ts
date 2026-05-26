/**
 * 클라이언트 새 배포 감지용 — 현재 deployment id 반환.
 * VersionUpdateToast가 1분 폴링 + 페이지 visibility 변경 시 호출.
 *
 * Vercel 환경변수 VERCEL_DEPLOYMENT_ID = `dpl_xxx` (새 배포마다 변경).
 * 로컬 dev 환경에선 'dev' 고정 → toast 트리거 X.
 */
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const dpl = process.env.VERCEL_DEPLOYMENT_ID ?? 'dev';
  return NextResponse.json(
    { dpl },
    {
      headers: {
        'cache-control': 'no-store, no-cache, must-revalidate',
      },
    },
  );
}
