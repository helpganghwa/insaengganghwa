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
        // dpl은 배포 시에만 바뀌는 전역 단일 값 — CDN 30초 캐시로 전 유저 폴링이
        // 분당 origin 2회로 수렴(2026-08-06 감사: 동접 1천 기준 월 1,700만 함수호출 절감).
        // 브라우저는 max-age=0으로 매번 엣지에 확인(감지 지연은 s-maxage 30초뿐 —
        // 클라 폴링 주기 5분보다 훨씬 작아 체감 없음).
        'cache-control': 'public, max-age=0, s-maxage=30, stale-while-revalidate=60',
      },
    },
  );
}
