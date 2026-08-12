import { afterAll, describe, expect, it } from 'vitest';

import { isUniqueViolation, pgConstraintName, pgErrorCode } from '@/lib/db/errors';

import { endTestDb, sql, testDb } from './db';

/**
 * SQLSTATE 판별 회귀 고정 — drizzle이 드라이버 에러를 감싸도 23505를 찾아내야 한다.
 * 래퍼(DrizzleQueryError)에는 code가 없고 message도 'Failed query: …'라, 이 헬퍼가
 * cause 체인을 못 벗기면 유니크 충돌 매핑(ALREADY_USED·SLOT_BUSY·멱등 흡수 등)이
 * 전부 조용히 무력화된다 — 실제 위반을 일으켜 그 경로를 고정한다.
 */
describe('pgErrorCode / isUniqueViolation', () => {
  afterAll(async () => {
    await endTestDb();
  });

  it('실제 유니크 위반(23505)을 드라이버 에러 래퍼 너머에서 찾는다', async () => {
    let caught: unknown;
    try {
      // temp table + 트랜잭션 — 공유 DB 무오염(위반으로 롤백, on commit drop).
      await testDb.transaction(async (tx) => {
        await tx.execute(sql`create temp table uq_probe (v int primary key) on commit drop`);
        await tx.execute(sql`insert into uq_probe (v) values (1)`);
        await tx.execute(sql`insert into uq_probe (v) values (1)`);
      });
    } catch (e) {
      caught = e;
    }

    expect(caught).toBeDefined();
    expect(pgErrorCode(caught)).toBe('23505');
    expect(isUniqueViolation(caught)).toBe(true);
  });

  it('다른 SQLSTATE는 유니크 위반으로 오인하지 않는다', async () => {
    let caught: unknown;
    try {
      await testDb.transaction(async (tx) => {
        await tx.execute(sql`create temp table uq_probe (v int primary key) on commit drop`);
        await tx.execute(sql`insert into uq_probe (v) values ('x')`); // 22P02
      });
    } catch (e) {
      caught = e;
    }

    expect(caught).toBeDefined();
    expect(pgErrorCode(caught)).toBe('22P02');
    // 일시 DB 오류를 '이미 사용됨'으로 흡수하면 정당한 요청이 조용히 유실된다(referral 감사 LOW).
    expect(isUniqueViolation(caught)).toBe(false);
  });

  it('cause가 순환해도 멈춘다', () => {
    const a: { cause?: unknown } = {};
    const b: { cause?: unknown } = { cause: a };
    a.cause = b;

    expect(pgErrorCode(a)).toBeUndefined();
    expect(isUniqueViolation(a)).toBe(false);
  });

  it('code 없는 에러·원시값은 undefined', () => {
    expect(pgErrorCode(new Error('boom'))).toBeUndefined();
    expect(pgErrorCode(null)).toBeUndefined();
    expect(pgErrorCode('23505')).toBeUndefined(); // 문자열 자체는 에러가 아님
  });

  /**
   * 한 문장이 여러 유니크 제약에 걸릴 수 있을 때(가입 캐릭터 INSERT: 닉 유니크 vs PK)
   * 어느 쪽인지 구분하는 추출기 — server-select.ts가 더블서밋(ALREADY_EXISTS)과
   * 닉 충돌(NICKNAME_TAKEN)을 가르는 근거다.
   */
  it('위반된 제약 이름을 래퍼 너머에서 찾는다 — 이름이 다르면 다르게 나온다', async () => {
    const grab = async (dupSql: ReturnType<typeof sql>): Promise<unknown> => {
      try {
        await testDb.transaction(async (tx) => {
          await tx.execute(sql`
            create temp table cn_probe (
              a int constraint cn_probe_a_uq unique,
              b int constraint cn_probe_b_uq unique
            ) on commit drop`);
          await tx.execute(sql`insert into cn_probe (a, b) values (1, 1)`);
          await tx.execute(dupSql);
        });
        return undefined;
      } catch (e) {
        return e;
      }
    };
    const eA = await grab(sql`insert into cn_probe (a, b) values (1, 2)`); // a 충돌
    const eB = await grab(sql`insert into cn_probe (a, b) values (2, 1)`); // b 충돌
    expect(isUniqueViolation(eA)).toBe(true);
    expect(isUniqueViolation(eB)).toBe(true);
    expect(pgConstraintName(eA)).toBe('cn_probe_a_uq');
    expect(pgConstraintName(eB)).toBe('cn_probe_b_uq');
  });

  it('constraint가 없는 에러는 undefined — 커넥션 에러의 문자열 code에 안 속는다', () => {
    // ECONNREFUSED류도 code가 문자열이라(실측), code 있는 노드에서 멈추는 구현이면 여기서 깨진다.
    const conn = Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' });
    expect(pgConstraintName(conn)).toBeUndefined();
    expect(pgConstraintName(new Error('boom'))).toBeUndefined();
    expect(pgConstraintName(null)).toBeUndefined();
  });
});
