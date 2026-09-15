import { afterAll, describe, expect, it } from 'vitest';

import { reorderUserProfiles } from '@/lib/game/profile/reorder';
import { endTestDb, sql, testDb } from '../db';

/**
 * 아바타 순서 저장(0200) — DB 통합. TEST 유저의 실제 아바타를 쓰되 트랜잭션 안에서만 갱신하고 롤백한다
 * (sort_order는 표시 순서뿐이라 실패해도 데이터 훼손 없음).
 */
const TEST_USER_ID = process.env.TEST_USER_ID ?? '';
const skip = !TEST_USER_ID;
const SERVER_ID = 1;

async function orderOf(tx: { execute: typeof testDb.execute }): Promise<{ id: string; ord: number }[]> {
  const rows = (await tx.execute(sql`
    select id::text as id, sort_order as ord from user_profiles
     where user_id = ${TEST_USER_ID}::uuid and server_id = ${SERVER_ID}
     order by sort_order asc, created_at desc
  `)) as unknown as { id: string; ord: number }[];
  return rows.map((r) => ({ id: r.id, ord: Number(r.ord) }));
}

describe.skipIf(skip)('아바타 순서 저장 — DB 통합', () => {
  afterAll(endTestDb);

  it('받은 순서대로 1..N, 빠진 것은 0(맨 앞), 롤백', async () => {
    await testDb.transaction(async (tx) => {
      const before = await orderOf(tx);
      if (before.length < 2) return; // 아바타 1개면 검증 불가 — 통과로 둔다
      const ids = before.map((r) => r.id);
      const reversed = [...ids].reverse();
      expect(await reorderUserProfiles(tx, TEST_USER_ID, SERVER_ID, reversed)).toBe('ok');
      const after = await orderOf(tx);
      expect(after.map((r) => r.id)).toEqual(reversed);
      expect(after.map((r) => r.ord)).toEqual(reversed.map((_x, i) => i + 1));

      // 하나를 빼고 저장 → 그 아바타는 0으로 맨 앞
      const [dropped, ...rest] = reversed;
      expect(await reorderUserProfiles(tx, TEST_USER_ID, SERVER_ID, rest)).toBe('ok');
      const after2 = await orderOf(tx);
      expect(after2[0]).toEqual({ id: dropped, ord: 0 });
      expect(after2.slice(1).map((r) => r.id)).toEqual(rest);
      throw new Error('ROLLBACK');
    }).catch((e: Error) => {
      if (e.message !== 'ROLLBACK') throw e;
    });
  });

  it('형식·중복·남의 아바타는 거부하고 아무것도 바꾸지 않는다', async () => {
    await testDb.transaction(async (tx) => {
      const before = await orderOf(tx);
      const ids = before.map((r) => r.id);
      expect(await reorderUserProfiles(tx, TEST_USER_ID, SERVER_ID, [])).toBe('INVALID');
      expect(await reorderUserProfiles(tx, TEST_USER_ID, SERVER_ID, ['not-a-uuid'])).toBe('INVALID');
      if (ids.length > 0) expect(await reorderUserProfiles(tx, TEST_USER_ID, SERVER_ID, [ids[0]!, ids[0]!])).toBe('INVALID');
      expect(
        await reorderUserProfiles(tx, TEST_USER_ID, SERVER_ID, [...ids, '00000000-0000-4000-8000-000000000000']),
      ).toBe('NOT_OWNED');
      expect(await orderOf(tx)).toEqual(before);
      throw new Error('ROLLBACK');
    }).catch((e: Error) => {
      if (e.message !== 'ROLLBACK') throw e;
    });
  });
});
