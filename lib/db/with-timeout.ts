import 'server-only';

/**
 * DB 쿼리 타임아웃 가드 — 핫패스 hang 보호.
 *
 * 매달린 쿼리가 풀(:6543, max:1)을 길게 점유하면 같은 인스턴스의 후속 요청이
 * 직렬 대기하다 함수 timeout(Vercel) → 전 페이지 다운. 짧은 가드로 빠르게
 * 실패시켜 풀을 풀어줌. caller는 catch 후 graceful fallback(빈 결과 등) 권장.
 *
 * ⚠ 실제 SQL cancel은 안 함(postgres-js + pgbouncer 환경 한계) — 단지 JS Promise
 * 분기만 끊음. 백엔드 쿼리는 계속 돌다 끝나지만 응답/렌더 경로는 즉시 풀림.
 */
export class DbTimeoutError extends Error {
  constructor(
    public readonly label: string,
    public readonly ms: number,
  ) {
    super(`DB query timeout (${label}, ${ms}ms)`);
    this.name = 'DbTimeoutError';
  }
}

export function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new DbTimeoutError(label, ms)), ms);
  });
  return Promise.race([p, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}
