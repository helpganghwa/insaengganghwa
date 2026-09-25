import { afterAll, describe, expect, it } from 'vitest';

import { restoreContribution, stashContribution } from '@/lib/game/guild/contribution-stash';

import { endTestDb, sql, testDb } from '../db';

/**
 * 길드 기여도 보관·복원(0217, 문의 #331) — 탈퇴·추방 뒤 같은 길드에 재가입하면 기여도가 이어진다.
 * 전부 롤백하는 트랜잭션 안에서 — 스테이징 데이터를 건드리지 않는다.
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

const two = async (tx: Tx) =>
  (await tx.execute(sql`select id::text id from guilds where server_id = 1 order by id limit 2`)) as unknown as { id: string }[];
const join = (tx: Tx, gid: string) =>
  tx.execute(sql`insert into guild_members (user_id, server_id, guild_id, role) values (${USER}::uuid, 1, ${gid}::bigint, 'member')`);
const leave = (tx: Tx) => tx.execute(sql`delete from guild_members where user_id = ${USER}::uuid and server_id = 1`);
const points = async (tx: Tx) =>
  Number(((await tx.execute(sql`select contribution_points::text p from guild_members where user_id = ${USER}::uuid and server_id = 1`)) as unknown as { p: string }[])[0]!.p);
const donate = (tx: Tx, n: number) =>
  tx.execute(sql`update guild_members set contribution_points = contribution_points + ${n} where user_id = ${USER}::uuid and server_id = 1`);
const stashed = async (tx: Tx) =>
  (await tx.execute(sql`select guild_id::text g, contribution_points::text p from guild_contribution_stash where user_id = ${USER}::uuid and server_id = 1 order by guild_id`)) as unknown as { g: string; p: string }[];

describe.skipIf(!USER)('길드 기여도 보관·복원', () => {
  afterAll(async () => {
    await endTestDb();
  });

  it('같은 길드 재가입이면 이어지고, 다른 길드면 0에서 시작한다', async () => {
    await inTx(async (tx) => {
      const [a, b] = await two(tx);
      expect(b).toBeDefined();
      await leave(tx);
      await tx.execute(sql`delete from guild_contribution_stash where user_id = ${USER}::uuid and server_id = 1`);

      await join(tx, a!.id);
      await restoreContribution(tx, USER, 1, a!.id);
      await donate(tx, 90);
      await stashContribution(tx, USER, 1);
      await leave(tx);
      expect(await stashed(tx)).toEqual([{ g: a!.id, p: '90' }]);

      // 다른 길드 — 이어지지 않고, A의 보관분은 그대로 남는다.
      await join(tx, b!.id);
      await restoreContribution(tx, USER, 1, b!.id);
      expect(await points(tx)).toBe(0);
      await donate(tx, 30);
      await stashContribution(tx, USER, 1);
      await leave(tx);

      // A로 복귀 — 90에서 이어진다. 보관 행은 꺼내면서 지워진다.
      await join(tx, a!.id);
      await restoreContribution(tx, USER, 1, a!.id);
      expect(await points(tx)).toBe(90);
      await donate(tx, 60);
      expect(await points(tx)).toBe(150);
      expect(await stashed(tx)).toEqual([{ g: b!.id, p: '30' }]);

      // 두 번째 이탈 — 현재 누적(150)으로 보관, 재가입 시 150.
      await stashContribution(tx, USER, 1);
      await leave(tx);
      await join(tx, a!.id);
      await restoreContribution(tx, USER, 1, a!.id);
      expect(await points(tx)).toBe(150);
    });
  });

  it('기여도 0이면 보관하지 않고, 보관분 없이 가입해도 그대로 0', async () => {
    await inTx(async (tx) => {
      const [a] = await two(tx);
      await leave(tx);
      await tx.execute(sql`delete from guild_contribution_stash where user_id = ${USER}::uuid and server_id = 1`);
      await join(tx, a!.id);
      await restoreContribution(tx, USER, 1, a!.id);
      expect(await points(tx)).toBe(0);
      await stashContribution(tx, USER, 1);
      expect(await stashed(tx)).toEqual([]);
    });
  });
});
