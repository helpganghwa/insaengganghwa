/**
 * 클라이언트 에러 수집 — 전역 unhandledrejection/onerror를 서버 로그(Vercel)로 전달.
 *
 * Sentry/PostHog 미가동 상태의 v1 관측성: 사용자 기기 오류가 어디에도 안 남던 공백을 메운다.
 * 외부 의존 없음. 클라(ClientErrorReporter)가 세션당 소량만 throttle 발송. 남용 방지로
 * 본문 길이 캡 + 204 즉시 반환(처리 비용 최소). 운영자는 Vercel 로그에서 `[client-error]` grep.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const raw = await req.text();
    if (raw.length > 4000) {
      console.error('[client-error] oversized report dropped', raw.length);
      return new Response(null, { status: 204 });
    }
    const b = JSON.parse(raw) as {
      kind?: string;
      message?: string;
      stack?: string;
      url?: string;
      ua?: string;
    };
    const msg = (b.message ?? '').slice(0, 500);
    const stack = (b.stack ?? '').slice(0, 1500);
    const url = (b.url ?? '').slice(0, 300);
    console.error(`[client-error:${b.kind ?? 'error'}] ${msg} @ ${url}\n${stack}`);
  } catch {
    // 파싱 실패 — 무시(남용/깨진 본문).
  }
  return new Response(null, { status: 204 });
}
