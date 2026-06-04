import 'server-only';

import type { PendingQuery, Row } from 'postgres';

import { getPgClient } from './client';
import { DbTimeoutError } from './with-timeout';

/**
 * 취소형 타임아웃 가드 — `withTimeout`과 달리 타임아웃 시 postgres.js `query.cancel()`로
 * **실제 쿼리를 취소(CancelRequest)** 해 점유 중이던 풀 커넥션을 즉시 회수한다.
 *
 * 배경: withTimeout은 JS Promise.race만 끊고 백엔드 쿼리는 계속 돌아 커넥션이 max_lifetime
 * 까지 묶임 → 트랜잭션 풀러 경유 죽은 소켓에서 멈춘 쿼리가 슬롯을 잡아 풀 고갈/간헐 미로딩.
 * RAW SQL 핫패스(요청 경로의 읽기 쿼리)는 이 가드로 감싸 즉시 회수한다.
 *
 * `build`는 raw 클라이언트로 단일 쿼리를 만들어 반환해야 한다(파라미터는 ${} 보간 — 자동 escape).
 * caller는 throw(DbTimeoutError 포함)를 catch해 graceful fallback 하는 것을 권장.
 */
export async function pgGuard<T extends readonly Row[]>(
  build: (sql: ReturnType<typeof getPgClient>) => PendingQuery<T>,
  ms: number,
  label: string,
): Promise<T> {
  const q = build(getPgClient());
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      // 백엔드 쿼리 취소 → 커넥션 회수. 취소 실패해도 JS는 reject로 진행.
      try {
        q.cancel();
      } catch {
        /* noop */
      }
      reject(new DbTimeoutError(label, ms));
    }, ms);
  });
  try {
    return await Promise.race([q, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
