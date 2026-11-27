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

/**
 * 넉넉한 타임아웃(2026-07-16 도입, 11-27 재시도 제거) — "타임아웃 = 페이지 사망"인 상세 페이지 핫로드용.
 * 이름은 호출부 호환으로 남겼다. 종전엔 ms 초과 시 새 쿼리로 1회 재시도했지만, 지금은 같은 쿼리를 ms×2까지 기다린다
 * (풀러 콜드 커넥트로 늦어진 첫 쿼리도 이 시간 안에 대개 끝난다).
 */
export async function withTimeoutRetry<T>(
  fn: () => Promise<T>,
  ms: number,
  label: string,
): Promise<T> {
  // 재시도 대신 같은 쿼리를 두 배 시간까지 기다린다(2026-11-27 렉 핫픽스). 시간 초과는 쿼리를 취소하지 않으므로
  // 재시도는 같은 쿼리를 하나 더 실어 보낼 뿐이었다 — postgres.js는 바쁜 연결 뒤에 쿼리를 이어 붙이고(pipeline)
  // 풀러 연결도 한정돼 있어, 막혔을 때 일이 두 배로 쌓여 60초 시간 초과로 번졌다. 최대 대기 시간은 종전과 같다.
  return withTimeout(fn(), ms * 2, label);
}
