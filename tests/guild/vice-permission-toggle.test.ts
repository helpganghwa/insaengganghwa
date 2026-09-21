import { afterAll, describe, expect, it } from 'vitest';

import { GuildError } from '@/lib/game/guild/errors';
import { GUILD_PERM } from '@/lib/game/guild/permissions';
import { setVicePermissionTx } from '@/lib/game/guild/roles';

import { endTestDb, sql, testDb } from '../db';

/**
 * 부길드장 권한은 **하나씩** 켜고 끈다(2026-09-21) — throwaway 길드를 꾸미고 ROLLBACK.
 * 핵심 회귀: 권한 화면을 열어 둔 사이 다른 경로로 켜진 비트(소급 SQL 0205 · 다른 기기)가 토글 한 번에 지워지면 안 된다.
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
  const [u2] = (await tx.execute(sql`
    select c.user_id::text as id from characters c
     where c.server_id = ${SERVER_ID} and c.user_id <> ${USER}::uuid order by c.user_id limit 1
  `)) as unknown as { id: string }[];
  if (!u2) throw new Error('두 번째 유저 없음');
  const VICE = u2.id;
  await tx.execute(sql`delete from guild_members where server_id = ${SERVER_ID} and user_id in (${USER}::uuid, ${VICE}::uuid)`);
  const [g] = (await tx.execute(sql`
    insert into guilds (name, leader_user_id, server_id) values (${`권한테스트${Date.now() % 100000}`}, ${USER}::uuid, ${SERVER_ID})
    returning id::text as id
  `)) as unknown as { id: string }[];
  const gid = g!.id;
  await tx.execute(sql`
    insert into guild_members (user_id, server_id, guild_id, role, permissions) values
      (${USER}::uuid, ${SERVER_ID}, ${gid}::bigint, 'leader', 0),
      (${VICE}::uuid, ${SERVER_ID}, ${gid}::bigint, 'vice', ${GUILD_PERM.notice | GUILD_PERM.taxDistribute})
  `);
  const perms = async () => {
    const [r] = (await tx.execute(sql`select permissions as p from guild_members where user_id = ${VICE}::uuid and server_id = ${SERVER_ID}`)) as unknown as { p: number }[];
    return r!.p;
  };
  return { VICE, gid, perms };
}

describe.skipIf(!USER)('부길드장 권한 — 하나씩 켜고 끈다', () => {
  afterAll(endTestDb);

  it('다른 경로로 켜진 비트를 지우지 않는다 — 화면이 모르는 수금 권한이 켜진 뒤 공지를 꺼도 수금은 남는다', async () => {
    await testDb
      .transaction(async (tx) => {
        const f = await setup(tx);
        // 길드장이 화면을 열어 둔 사이 소급 SQL(0205)이 수금 권한을 켰다고 하자. 화면은 여전히 '공지 + 분배'로 알고 있다.
        await tx.execute(sql`update guild_members set permissions = permissions | 512 where user_id = ${f.VICE}::uuid and server_id = ${SERVER_ID}`);
        await setVicePermissionTx(tx, { leaderUserId: USER, serverId: SERVER_ID, targetUserId: f.VICE, key: 'notice', on: false });
        expect(await f.perms()).toBe(GUILD_PERM.taxDistribute | GUILD_PERM.taxCollect);

        await setVicePermissionTx(tx, { leaderUserId: USER, serverId: SERVER_ID, targetUserId: f.VICE, key: 'taxCollect', on: false });
        expect(await f.perms()).toBe(GUILD_PERM.taxDistribute);
        await setVicePermissionTx(tx, { leaderUserId: USER, serverId: SERVER_ID, targetUserId: f.VICE, key: 'deploy', on: true });
        expect(await f.perms()).toBe(GUILD_PERM.taxDistribute | GUILD_PERM.deploy);
        throw ROLLBACK;
      })
      .catch((e) => {
        if (e !== ROLLBACK) throw e;
      });
  });

  it('변화가 없으면 기록하지 않고, 바뀌면 어떤 권한을 켰는지까지 남긴다', async () => {
    await testDb
      .transaction(async (tx) => {
        const f = await setup(tx);
        await setVicePermissionTx(tx, { leaderUserId: USER, serverId: SERVER_ID, targetUserId: f.VICE, key: 'notice', on: true });
        await setVicePermissionTx(tx, { leaderUserId: USER, serverId: SERVER_ID, targetUserId: f.VICE, key: 'taxCollect', on: true });
        const logs = (await tx.execute(sql`
          select detail from guild_audit_log where guild_id = ${f.gid}::bigint and action = 'set_perm' order by id
        `)) as unknown as { detail: { before: number; after: number; key: string; on: boolean } }[];
        expect(logs).toHaveLength(1);
        expect(logs[0]!.detail).toMatchObject({ before: 129, after: 641, key: 'taxCollect', on: true });
        throw ROLLBACK;
      })
      .catch((e) => {
        if (e !== ROLLBACK) throw e;
      });
  });

  it('길드장만 바꿀 수 있고, 대상은 같은 길드의 부길드장이어야 한다', async () => {
    await testDb
      .transaction(async (tx) => {
        const f = await setup(tx);
        // 부길드장이 자기 권한을 올리려는 시도.
        expect(await code(setVicePermissionTx(tx, { leaderUserId: f.VICE, serverId: SERVER_ID, targetUserId: f.VICE, key: 'kick', on: true }))).toBe('NOT_LEADER');
        // 길드장 자신은 대상이 아니다(권한 개념이 없다).
        expect(await code(setVicePermissionTx(tx, { leaderUserId: USER, serverId: SERVER_ID, targetUserId: USER, key: 'kick', on: true }))).toBe('INVALID_TARGET');
        await tx.execute(sql`update guild_members set role = 'member', permissions = 0 where user_id = ${f.VICE}::uuid and server_id = ${SERVER_ID}`);
        expect(await code(setVicePermissionTx(tx, { leaderUserId: USER, serverId: SERVER_ID, targetUserId: f.VICE, key: 'kick', on: true }))).toBe('INVALID_TARGET');
        throw ROLLBACK;
      })
      .catch((e) => {
        if (e !== ROLLBACK) throw e;
      });
  });
});
