import { runWithDb } from '@/lib/db/client';

import { sql, testDb } from '../db';

export type Tx = Parameters<Parameters<typeof testDb.transaction>[0]>[0];
const ROLLBACK = new Error('ROLLBACK');

/**
 * fn 안에서 전역 `db`를 쓰는 코드가 모두 이 트랜잭션을 타게 하고(runWithDb), 끝나면 되돌린다 — 커밋 0.
 * 임시 servers·characters 행을 넣고 관문 함수를 그대로 부를 수 있다(3차 검사 F §4.2).
 * ⚠ `getPgClient()`·`pgGuard`로 실제 풀에 직접 붙는 코드(layout-data, 대시보드)는 이 스코프 밖이라 대상이 아니다.
 */
export async function inRollback(fn: (tx: Tx) => Promise<void>): Promise<void> {
  await testDb
    .transaction(async (tx) => {
      await runWithDb(tx as never, () => fn(tx));
      throw ROLLBACK;
    })
    .catch((e) => {
      if (e !== ROLLBACK) throw e;
    });
}

/** 임시 서버(91xx — 다른 테스트의 9001~9060·9999와 겹치지 않게) + 선택적으로 그 서버의 캐릭터. 커밋되지 않으므로 크론에 안 보인다. */
export async function tempServer(tx: Tx, id: number, status: 'open' | 'full' | 'closed', withCharFor?: string): Promise<void> {
  await tx.execute(sql`insert into servers (id, name, status) values (${id}, ${`테스트${id}`}, ${status})`);
  if (withCharFor) {
    await tx.execute(sql`insert into characters (user_id, server_id, nickname)
                         values (${withCharFor}::uuid, ${id}, ${`t${id}x${Date.now() % 100000}`})`);
  }
}
