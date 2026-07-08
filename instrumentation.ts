/**
 * 서버 관측 훅 — 라우트 핸들러 / 서버 액션 / RSC 렌더에서 **던져진(uncaught)** 에러를
 * client_errors에 그룹 적재한다. 지금까지 서버 throw는 Vercel 로그로만 사라져(어드민에서
 * 안 보임) 관측 사각이었다. 클라 에러(/api/client-error)와 **동일 파이프**로 모아 어드민
 * /admin/client-errors 한 곳에서 본다.
 *
 * best-effort: onRequestError 자체 실패가 요청 처리를 막지 않도록 전부 삼킨다. 무거운 의존
 * (postgres 클라)은 실제 에러 발생 시에만 로드되게 동적 import(엣지 런타임 오염 방지).
 * redirect()/notFound() 등 프레임워크 제어흐름은 Next가 여기로 넘기지 않는다(실제 버그만 포착).
 */
export async function onRequestError(
  error: unknown,
  request: { path: string; method: string },
  context: { routerKind: string; routePath: string; routeType: string },
): Promise<void> {
  try {
    const e = error as { message?: string; stack?: string } | null;
    const msg = e?.message ?? String(error);
    // DB/커넥션 장애 계열은 기록을 건너뛴다 — 그 순간 client_errors 쓰기도 같은 DB라 실패하며
    // 포화를 증폭시킨다(장애 중 write 폭증 방지). 애플리케이션 로직 throw는 정상 기록.
    if (/timeout|ECONNREFUSED|ETIMEDOUT|connect|pool|too many clients|Connection terminated/i.test(msg)) {
      return;
    }
    const { recordError } = await import('@/lib/ops/record-error');
    const where = `${context.routeType || context.routerKind} ${request.method} ${context.routePath || request.path}`;
    await recordError({
      kind: 'server',
      message: `[${where}] ${msg}`,
      url: request.path,
      stack: e?.stack ?? null,
    });
  } catch {
    /* 관측은 best-effort — 훅 실패가 앱을 막지 않는다. */
  }
}
