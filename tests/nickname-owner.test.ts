import { afterAll, describe, expect, it } from 'vitest';

import { isExclusionViolation, isNicknameTaken, isUniqueViolation, pgErrorCode } from '@/lib/db/errors';

import { endTestDb, sql, testDb } from './db';

/**
 * 닉네임은 사람에게 붙는다(0207, 2026-09-21 ⑩).
 *  - 다른 사람과는 어느 서버에서도 겹칠 수 없다(제외 제약, 23P01).
 *  - 같은 계정은 다른 서버의 자기 캐릭터에 같은 이름을 쓸 수 있다.
 *  - 대소문자만 다른 이름도 같은 이름으로 본다.
 * 모든 검사는 롤백하는 트랜잭션 안에서 — 스테이징 데이터를 건드리지 않는다.
 */
const USER = process.env.TEST_USER_ID ?? '';
const ROLLBACK = new Error('ROLLBACK');
type Tx = Parameters<Parameters<typeof testDb.transaction>[0]>[0];

const inTx = async (fn: (tx: Tx) => Promise<void>) => {
  await testDb
    .transaction(async (tx) => {
      await fn(tx);
      throw ROLLBACK;
    })
    .catch((e) => {
      if (e !== ROLLBACK) throw e;
    });
};

/** 그 서버에 캐릭터 한 줄 — 생성 로직을 타지 않고 제약만 본다. */
async function put(tx: Tx, userId: string, serverId: number, nickname: string) {
  await tx.execute(sql`
    insert into characters (user_id, server_id, nickname) values (${userId}::uuid, ${serverId}, ${nickname})
  `);
}

/**
 * 실패가 예상되는 문장을 **세이브포인트 안**에서 돌린다 — 트랜잭션은 한 번 실패하면 그 뒤
 * 문장이 전부 25P02로 튕기므로, 중첩 트랜잭션(savepoint)으로 실패를 가둬야 이어서 검사할 수 있다.
 */
const codeIn = async (tx: Tx, fn: (t: Tx) => Promise<unknown>) =>
  tx
    .transaction(async (inner) => {
      await fn(inner);
      return null as string | null;
    })
    .catch((e: unknown) => pgErrorCode(e) ?? `THROWN:${String(e)}`);

describe.skipIf(!USER)('닉네임 소유 — 이름 하나에 사람 하나', () => {
  afterAll(endTestDb);

  it('같은 계정은 다른 서버에서 자기 이름을 그대로 쓴다', async () => {
    await inTx(async (tx) => {
      await tx.execute(sql`insert into servers (id, name, status) values (9001, '테스트A', 'closed'), (9002, '테스트B', 'closed')`);
      const nick = `소유테스트${Date.now() % 100000}`;
      await put(tx, USER, 9001, nick);
      // 종전 전역 유니크였다면 여기서 23505가 났다.
      expect(await codeIn(tx, (t) => put(t, USER, 9002, nick))).toBeNull();
    });
  });

  it('다른 사람은 그 이름을 어느 서버에서도 쓸 수 없다', async () => {
    await inTx(async (tx) => {
      await tx.execute(sql`insert into servers (id, name, status) values (9001, '테스트A', 'closed'), (9002, '테스트B', 'closed')`);
      const [other] = (await tx.execute(sql`
        select user_id::text as id from characters where user_id <> ${USER}::uuid limit 1
      `)) as unknown as { id: string }[];
      if (!other) return;
      const nick = `소유테스트${Date.now() % 100000}b`;
      await put(tx, USER, 9001, nick);
      // 같은 서버에서도, 다른 서버에서도 막힌다. 어느 제약이 먼저 걸리는지는 정해져 있지 않다
      // (서버 내 유니크 23505 · 소유 제약 23P01) — 둘 다 '이미 쓰는 이름'이라는 뜻이다.
      const sameServer = await codeIn(tx, (t) => put(t, other.id, 9001, nick));
      const otherServer = await codeIn(tx, (t) => put(t, other.id, 9002, nick));
      expect(['23505', '23P01']).toContain(sameServer);
      expect(otherServer).toBe('23P01'); // 다른 서버라 유니크는 안 걸리고 소유 제약만 남는다
    });
  });

  it('대소문자만 다른 이름도 남이 못 쓴다', async () => {
    await inTx(async (tx) => {
      await tx.execute(sql`insert into servers (id, name, status) values (9002, '테스트B', 'closed')`);
      const [other] = (await tx.execute(sql`
        select user_id::text as id from characters where user_id <> ${USER}::uuid limit 1
      `)) as unknown as { id: string }[];
      if (!other) return;
      const nick = `Owner${Date.now() % 100000}`;
      await put(tx, USER, 9002, nick);
      await tx.execute(sql`insert into servers (id, name, status) values (9003, '테스트C', 'closed')`);
      expect(await codeIn(tx, (t) => put(t, other.id, 9003, nick.toLowerCase()))).toBe('23P01');
    });
  });

  it('두 위반 모두 "이미 쓰는 이름"으로 읽힌다 — 재추첨 루프가 죽지 않는다', () => {
    const uniq = { cause: { code: '23505' } };
    const excl = { cause: { code: '23P01' } };
    expect(isUniqueViolation(uniq)).toBe(true);
    expect(isExclusionViolation(excl)).toBe(true);
    expect(isNicknameTaken(uniq)).toBe(true);
    expect(isNicknameTaken(excl)).toBe(true);
    expect(isNicknameTaken({ cause: { code: '23503' } })).toBe(false);
  });
});
