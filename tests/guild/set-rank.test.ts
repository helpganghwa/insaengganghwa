import { afterAll, describe, expect, it } from 'vitest';

import { GuildError } from '@/lib/game/guild/errors';
import { GUILD_PERM } from '@/lib/game/guild/permissions';
import { setViceRoleTx } from '@/lib/game/guild/roles';
import { setMemberRankTx } from '@/lib/game/guild/set-rank';

import { endTestDb, sql, testDb } from '../db';

/**
 * 길드원 직급 R1~R3(0244) — throwaway 길드를 꾸미고 ROLLBACK(실 DB 무오염).
 * 길드장 · '직급 관리' 권한 부길드장만 바꾸고, 대상은 길드원만, 값이 같으면 기록이 없고, 부길드장 해제는 R3.
 */
const USER = process.env.TEST_USER_ID ?? '';
const SERVER_ID = 1;
const ROLLBACK = new Error('ROLLBACK');
type Tx = Parameters<Parameters<typeof testDb.transaction>[0]>[0];

const code = async (p: Promise<unknown>) => {
  try {
    await p;
    return null;
  } catch (e) {
    return e instanceof GuildError ? e.code : `THROWN:${String(e)}`;
  }
};

async function setup(tx: Tx) {
  const others = (await tx.execute(sql`
    select c.user_id::text as id from characters c
     where c.server_id = ${SERVER_ID} and c.user_id <> ${USER}::uuid order by c.user_id limit 2
  `)) as unknown as { id: string }[];
  if (others.length < 2) throw new Error('다른 유저 둘 필요');
  const [VICE, MEMBER] = [others[0]!.id, others[1]!.id];
  await tx.execute(sql`delete from guild_members where server_id = ${SERVER_ID} and user_id in (${USER}::uuid, ${VICE}::uuid, ${MEMBER}::uuid)`);
  const [g] = (await tx.execute(sql`
    insert into guilds (name, leader_user_id, server_id) values (${`직급테스트${Date.now() % 100000}`}, ${USER}::uuid, ${SERVER_ID})
    returning id::text as id
  `)) as unknown as { id: string }[];
  const gid = g!.id;
  await tx.execute(sql`
    insert into guild_members (user_id, server_id, guild_id, role, permissions) values
      (${USER}::uuid, ${SERVER_ID}, ${gid}::bigint, 'leader', 0),
      (${VICE}::uuid, ${SERVER_ID}, ${gid}::bigint, 'vice', ${GUILD_PERM.notice}),
      (${MEMBER}::uuid, ${SERVER_ID}, ${gid}::bigint, 'member', 0)
  `);
  const rankOf = async (uid: string) => {
    const [r] = (await tx.execute(sql`select rank, role::text as role from guild_members where user_id = ${uid}::uuid and server_id = ${SERVER_ID}`)) as unknown as { rank: number; role: string }[];
    return r!;
  };
  const logs = async () => {
    const r = (await tx.execute(sql`
      select detail from guild_audit_log where guild_id = ${gid}::bigint and action = 'set_rank' order by id
    `)) as unknown as { detail: { from: number; to: number } }[];
    return r.map((x) => `${x.detail.from}>${x.detail.to}`);
  };
  return { VICE, MEMBER, gid, rankOf, logs };
}

describe.skipIf(!USER)('길드원 직급 변경', () => {
  afterAll(endTestDb);

  it('가입 기본 R1 · 길드장이 R3로 올리고 R2로 내리면 값과 기록이 남는다 · 같은 값은 기록하지 않는다', async () => {
    await testDb
      .transaction(async (tx) => {
        const f = await setup(tx);
        expect((await f.rankOf(f.MEMBER)).rank).toBe(1);
        await setMemberRankTx(tx, { actorUserId: USER, serverId: SERVER_ID, targetUserId: f.MEMBER, rank: 3 });
        expect((await f.rankOf(f.MEMBER)).rank).toBe(3);
        await setMemberRankTx(tx, { actorUserId: USER, serverId: SERVER_ID, targetUserId: f.MEMBER, rank: 3 });
        await setMemberRankTx(tx, { actorUserId: USER, serverId: SERVER_ID, targetUserId: f.MEMBER, rank: 2 });
        expect((await f.rankOf(f.MEMBER)).rank).toBe(2);
        expect(await f.logs()).toEqual(['1>3', '3>2']);
        throw ROLLBACK;
      })
      .catch((e) => {
        if (e !== ROLLBACK) throw e;
      });
  });

  it("'직급 관리' 권한이 없는 부길드장은 NO_PERMISSION, 있으면 가능 · 대상이 부길드장·길드장이면 INVALID_TARGET · 범위 밖 값은 INVALID_RANK", async () => {
    await testDb
      .transaction(async (tx) => {
        const f = await setup(tx);
        expect(await code(setMemberRankTx(tx, { actorUserId: f.VICE, serverId: SERVER_ID, targetUserId: f.MEMBER, rank: 2 }))).toBe('NO_PERMISSION');
        await tx.execute(sql`update guild_members set permissions = permissions | ${GUILD_PERM.rank} where user_id = ${f.VICE}::uuid and server_id = ${SERVER_ID}`);
        expect(await code(setMemberRankTx(tx, { actorUserId: f.VICE, serverId: SERVER_ID, targetUserId: f.MEMBER, rank: 2 }))).toBeNull();
        expect((await f.rankOf(f.MEMBER)).rank).toBe(2);
        // 부길드장끼리 · 길드장은 대상이 아니다(역할이 곧 직급).
        expect(await code(setMemberRankTx(tx, { actorUserId: USER, serverId: SERVER_ID, targetUserId: f.VICE, rank: 2 }))).toBe('INVALID_TARGET');
        expect(await code(setMemberRankTx(tx, { actorUserId: f.VICE, serverId: SERVER_ID, targetUserId: USER, rank: 2 }))).toBe('INVALID_TARGET');
        expect(await code(setMemberRankTx(tx, { actorUserId: USER, serverId: SERVER_ID, targetUserId: f.MEMBER, rank: 4 as never }))).toBe('INVALID_RANK');
        // 길드원은 권한 비트가 있어도 못 바꾼다.
        await tx.execute(sql`update guild_members set permissions = ${GUILD_PERM.rank} where user_id = ${f.MEMBER}::uuid and server_id = ${SERVER_ID}`);
        expect(await code(setMemberRankTx(tx, { actorUserId: f.MEMBER, serverId: SERVER_ID, targetUserId: f.MEMBER, rank: 3 }))).toBe('INVALID_TARGET');
        throw ROLLBACK;
      })
      .catch((e) => {
        if (e !== ROLLBACK) throw e;
      });
  });

  it('부길드장을 해제하면 R3가 되고, 다시 임명해도 직급 열은 그대로다', async () => {
    await testDb
      .transaction(async (tx) => {
        const f = await setup(tx);
        await setViceRoleTx(tx, { leaderUserId: USER, serverId: SERVER_ID, targetUserId: f.VICE, makeVice: false });
        expect(await f.rankOf(f.VICE)).toEqual({ rank: 3, role: 'member' });
        await setViceRoleTx(tx, { leaderUserId: USER, serverId: SERVER_ID, targetUserId: f.VICE, makeVice: true });
        expect((await f.rankOf(f.VICE)).role).toBe('vice');
        throw ROLLBACK;
      })
      .catch((e) => {
        if (e !== ROLLBACK) throw e;
      });
  });
});
