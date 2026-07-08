/**
 * 클라이언트 에러 수집 — 전역 unhandledrejection/onerror를 client_errors 테이블에 그룹 적재.
 *
 * Sentry 미가동 v1 관측성: fingerprint(kind:message)로 그룹화해 동일 에러는 count 증가(폭주 방지).
 * 어드민 /admin/client-errors에서 조회. 공개 엔드포인트라 본문 캡 + 미해결 행 상한으로 남용 방어.
 * 항상 204(처리 비용 최소·정보 노출 없음).
 */
import { recordError } from '@/lib/ops/record-error';
import { rateLimited } from '@/lib/ratelimit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  // 무인증 공개 엔드포인트 — IP 기반 레이트리밋으로 count 인플레이션·DB 쓰기 증폭 남용 방어.
  // Vercel이 설정하는 x-real-ip를 우선(신뢰) — x-forwarded-for 최좌측은 클라 위조 가능해
  // 매 요청 회전 시 리밋 우회되므로 폴백으로만.
  const ip =
    req.headers.get('x-real-ip') ||
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    'unknown';
  if (await rateLimited(`ce:${ip}`, 'clientError')) return new Response(null, { status: 204 });
  try {
    const raw = await req.text();
    if (raw.length > 4000) return new Response(null, { status: 204 });
    const b = JSON.parse(raw) as {
      kind?: string;
      message?: string;
      stack?: string;
      url?: string;
      ua?: string;
    };
    const message = (b.message ?? '').slice(0, 500);
    if (!message) return new Response(null, { status: 204 });
    // 적재·그룹화·상한은 공용 헬퍼(서버 throw 집계와 동일 경로).
    await recordError({ kind: b.kind ?? 'error', message, url: b.url, ua: b.ua, stack: b.stack });
  } catch {
    // 파싱/DB 실패 — 무시(관측은 best-effort, 사용자 영향 없음).
  }
  return new Response(null, { status: 204 });
}
