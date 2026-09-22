import { afterAll, describe, expect, it } from 'vitest';

import { setDeployVisibilityTx } from '@/lib/game/guild/conquest/set-deploy-visibility';
import { GuildError } from '@/lib/game/guild/errors';

import { endTestDb, sql, testDb } from '../db';

/** 배치 정보 공개 범위 설정(0204) — throwaway 길드를 꾸미고 ROLLBACK(실 DB 무오염). */
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
  await tx.execute(sql`delete from guild_members where server_id = ${SERVER_ID} and user_id = ${USER}::uuid`);
  const [g] = (await tx.execute(sql`
    insert into guilds (name, leader_user_id, server_id) values (${`공개테스트${Date.now() % 100000}`}, ${USER}::uuid, ${SERVER_ID})
    returning id::text as id
  `)) as unknown as { id: string }[];
  const gid = g!.id;
  await tx.execute(sql`insert into guild_members (user_id, server_id, guild_id, role) values (${USER}::uuid, ${SERVER_ID}, ${gid}::bigint, 'leader')`);
  const vis = async () => {
    const [r] = (await tx.execute(sql`select deploy_visibility as v from guilds where id = ${gid}::bigint`)) as unknown as { v: string }[];
    return r!.v;
  };
  const logs = async () => {
    const r = (await tx.execute(sql`
      select detail from guild_audit_log where guild_id = ${gid}::bigint and action = 'set_deploy_visibility' order by id
    `)) as unknown as { detail: { visibility: string } }[];
    return r.map((x) => x.detail.visibility);
  };
  const setRole = (role: string, perms: number) =>
    tx.execute(sql`update guild_members set role = ${role}, permissions = ${perms} where user_id = ${USER}::uuid and server_id = ${SERVER_ID}`);
  return { vis, logs, setRole };
}

describe.skipIf(!USER)('배치 정보 공개 범위 설정', () => {
  afterAll(endTestDb);

  it("새 길드는 'all'로 시작하고, 길드장이 바꾸면 값과 길드 기록이 남는다 · 같은 값은 기록하지 않는다", async () => {
    await testDb
      .transaction(async (tx) => {
        const f = await setup(tx);
        expect(await f.vis()).toBe('all');
        await setDeployVisibilityTx(tx, { userId: USER, serverId: SERVER_ID, visibility: 'officer' });
        expect(await f.vis()).toBe('officer');
        await setDeployVisibilityTx(tx, { userId: USER, serverId: SERVER_ID, visibility: 'officer' });
        expect(await f.logs()).toEqual(['officer']);
        await setDeployVisibilityTx(tx, { userId: USER, serverId: SERVER_ID, visibility: 'all' });
        expect(await f.vis()).toBe('all');
        expect(await f.logs()).toEqual(['officer', 'all']);
        throw ROLLBACK;
      })
      .catch((e) => {
        if (e !== ROLLBACK) throw e;
      });
  });

  it('부길드장·일반 길드원은 바꿀 수 없다(NOT_LEADER) · 다른 서버·길드 없음은 NOT_IN_GUILD', async () => {
    await testDb
      .transaction(async (tx) => {
        const f = await setup(tx);
        await f.setRole('vice', 1023);
        expect(await code(setDeployVisibilityTx(tx, { userId: USER, serverId: SERVER_ID, visibility: 'officer' }))).toBe('NOT_LEADER');
        await f.setRole('member', 0);
        expect(await code(setDeployVisibilityTx(tx, { userId: USER, serverId: SERVER_ID, visibility: 'officer' }))).toBe('NOT_LEADER');
        // 서버 분리 — 1서버 길드장이 다른 서버 번호로 부르면 그 서버에는 소속이 없다.
        await f.setRole('leader', 0);
        expect(await code(setDeployVisibilityTx(tx, { userId: USER, serverId: 9, visibility: 'officer' }))).toBe('NOT_IN_GUILD');
        expect(await f.vis()).toBe('all');
        await tx.execute(sql`delete from guild_members where server_id = ${SERVER_ID} and user_id = ${USER}::uuid`);
        expect(await code(setDeployVisibilityTx(tx, { userId: USER, serverId: SERVER_ID, visibility: 'officer' }))).toBe('NOT_IN_GUILD');
        throw ROLLBACK;
      })
      .catch((e) => {
        if (e !== ROLLBACK) throw e;
      });
  });
});
