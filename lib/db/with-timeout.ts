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
 * 타임아웃 + 1회 재시도(2026-07-16) — "타임아웃 = 페이지 사망"인 상세 페이지 핫로드용.
 * 풀러 콜드 커넥트 스파이크(CONNECT_TIMEOUT :6543, 라이브 guild/raid 사례)는 첫 실패
 * 직후 재시도에서 거의 항상 성공한다 — 유저는 에러 화면 대신 1~2초 추가 대기.
 * fn은 호출마다 새 쿼리를 만들어야 함(프로미스 재사용 금지 — 이미 걸린 쿼리 재대기 방지).
 */
export async function withTimeoutRetry<T>(
  fn: () => Promise<T>,
  ms: number,
  label: string,
): Promise<T> {
  try {
    return await withTimeout(fn(), ms, label);
  } catch (e) {
    if (!(e instanceof DbTimeoutError)) throw e;
    console.warn(`[withTimeoutRetry] ${label} ${ms}ms 초과 — 1회 재시도`);
    return await withTimeout(fn(), ms, `${label}#retry`);
  }
}
