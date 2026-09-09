import { afterAll, describe, expect, it } from 'vitest';

import { GUILD_PERM } from '@/lib/game/guild/permissions';
import { collectAllZoneTax, collectZoneTaxTx, listCollectableZoneIds } from '@/lib/game/guild/collect';
import { GuildError } from '@/lib/game/guild/errors';

import { endTestDb, sql, testDb } from '../db';

/**
 * 세금 수금 주체 확장 + 일괄 수금(2026-09-08) — 한 트랜잭션 안에서 throwaway 길드·구역을 꾸미고 ROLLBACK.
 * 일괄 수금은 실행기(runner)로 바깥 tx를 넘겨 구역별 트랜잭션이 세이브포인트로 돌게 한다 — 실 DB 무오염.
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

/** 길드 + 멤버(리더=USER, 일반=U2) + 구역 3곳: A(집행관 U2, 1000) · B(공석, 500) · C(집행관 USER, 250). */
async function setup(tx: Tx) {
  const [u2] = (await tx.execute(sql`
    select c.user_id::text as id from characters c
     where c.server_id = ${SERVER_ID} and c.user_id <> ${USER}::uuid
     order by c.user_id limit 1
  `)) as unknown as { id: string }[];
  if (!u2) throw new Error('두 번째 유저 없음');
  const U2 = u2.id;
  await tx.execute(sql`delete from guild_members where server_id = ${SERVER_ID} and user_id in (${USER}::uuid, ${U2}::uuid)`);
  const [g] = (await tx.execute(sql`
    insert into guilds (name, leader_user_id, server_id) values (${`세금테스트${Date.now() % 100000}`}, ${USER}::uuid, ${SERVER_ID})
    returning id::text as id
  `)) as unknown as { id: string }[];
  const gid = g!.id;
  await tx.execute(sql`
    insert into guild_members (user_id, server_id, guild_id, role) values
      (${USER}::uuid, ${SERVER_ID}, ${gid}::bigint, 'leader'),
      (${U2}::uuid, ${SERVER_ID}, ${gid}::bigint, 'member')
  `);
  const zs = (await tx.execute(sql`select id from zones where server_id = ${SERVER_ID} order by id limit 3`)) as unknown as { id: number }[];
  const [A, B, C] = zs.map((z) => Number(z.id));
  const set = (id: number, executor: string | null, tax: number) =>
    tx.execute(sql`
      update zones set owner_guild_id = ${gid}::bigint, executor_user_id = ${executor}::uuid,
        tax_diamond = ${tax}, captured_at = now() - interval '4 days', last_tax_collected_at = null
      where id = ${id}
    `);
  await set(A!, U2, 1000);
  await set(B!, null, 500);
  await set(C!, USER, 250);
  const diamond = async (uid: string) => {
    const [r] = (await tx.execute(sql`select diamond::text as d from characters where user_id = ${uid}::uuid and server_id = ${SERVER_ID}`)) as unknown as { d: string }[];
    return BigInt(r!.d);
  };
  const pool = async () => {
    const [r] = (await tx.execute(sql`select tax_pool_diamond::text as p from guilds where id = ${gid}::bigint`)) as unknown as { p: string }[];
    return BigInt(r!.p);
  };
  const zone = async (id: number) => {
    const [r] = (await tx.execute(sql`select tax_diamond::text as t, last_tax_collected_at as at from zones where id = ${id}`)) as unknown as { t: string; at: Date | null }[];
    return { tax: BigInt(r!.t), at: r!.at };
  };
  const setRole = (role: string, perms: number) =>
    tx.execute(sql`update guild_members set role = ${role}, permissions = ${perms} where user_id = ${USER}::uuid and server_id = ${SERVER_ID}`);
  return { U2, gid: BigInt(gid), A: A!, B: B!, C: C!, diamond, pool, zone, set, setRole };
}

describe.skipIf(!USER)('세금 수금 — 권한자 대리 수금 · 일괄 수금', () => {
  afterAll(endTestDb);

  it('길드장이 남의 구역을 대리 수금하면 10%는 집행관 지갑, 90%는 곳간', async () => {
    await testDb
      .transaction(async (tx) => {
        const f = await setup(tx);
        const before = await f.diamond(f.U2);
        const r = await collectZoneTaxTx(tx, { userId: USER, zoneId: f.A });
        expect(r.executorGain).toBe(100n);
        expect(r.guildGain).toBe(900n);
        expect(r.executorUserId).toBe(f.U2);
        expect(await f.diamond(f.U2)).toBe(before + 100n);
        expect(await f.pool()).toBe(900n);
        const z = await f.zone(f.A);
        expect(z.tax).toBe(0n);
        expect(z.at).not.toBeNull();
        // 로그 행위자 = 버튼을 누른 사람(길드장).
        const [log] = (await tx.execute(sql`
          select actor_user_id::text as actor, detail from guild_audit_log
           where guild_id = ${f.gid.toString()}::bigint and action = 'tax_collect' order by id desc limit 1
        `)) as unknown as { actor: string; detail: { amount: string; zoneId: number } }[];
        expect(log?.actor).toBe(USER);
        expect(log?.detail.amount).toBe('900');
        throw ROLLBACK;
      })
      .catch((e) => {
        if (e !== ROLLBACK) throw e;
      });
  });

  it('집행관 공석 구역은 누구도 수금 불가 · 권한 없는 길드원은 NO_PERMISSION', async () => {
    await testDb
      .transaction(async (tx) => {
        const f = await setup(tx);
        expect(await code(collectZoneTaxTx(tx, { userId: USER, zoneId: f.B }))).toBe('NOT_EXECUTOR');

        await f.setRole('member', 0);
        expect(await code(collectZoneTaxTx(tx, { userId: USER, zoneId: f.A }))).toBe('NO_PERMISSION');
        // 내가 집행관인 구역은 직책과 무관하게 걷는다(종전 그대로).
        const mine = await collectZoneTaxTx(tx, { userId: USER, zoneId: f.C });
        expect(mine.executorGain).toBe(25n);
        expect(mine.executorUserId).toBe(USER);

        await f.setRole('vice', 0);
        expect(await code(collectZoneTaxTx(tx, { userId: USER, zoneId: f.A }))).toBe('NO_PERMISSION');
        await f.setRole('vice', GUILD_PERM.taxDistribute);
        expect((await collectZoneTaxTx(tx, { userId: USER, zoneId: f.A })).guildGain).toBe(900n);
        throw ROLLBACK;
      })
      .catch((e) => {
        if (e !== ROLLBACK) throw e;
      });
  });

  it('일괄 수금 — 수금 가능한 구역만 전부, 공석·쿨다운 구역은 제외, 내 몫만 myGain', async () => {
    await testDb
      .transaction(async (tx) => {
        const f = await setup(tx);
        // 쿨다운 중인 구역 하나 더 — 목록에서 빠져야 한다.
        const [d] = (await tx.execute(sql`select id from zones where server_id = ${SERVER_ID} order by id offset 3 limit 1`)) as unknown as { id: number }[];
        const D = Number(d!.id);
        await f.set(D, f.U2, 700);
        await tx.execute(sql`update zones set last_tax_collected_at = now() - interval '1 hour' where id = ${D}`);

        const ids = await listCollectableZoneIds(f.gid, SERVER_ID, tx);
        expect(ids).toEqual([f.A, f.C].sort((a, b) => a - b));

        const u2Before = await f.diamond(f.U2);
        const meBefore = await f.diamond(USER);
        const r = await collectAllZoneTax({ userId: USER, serverId: SERVER_ID }, tx);
        expect(r.collected.map((c) => c.zoneId).sort((a, b) => a - b)).toEqual(ids);
        expect(r.failed).toEqual([]);
        expect(r.total).toBe(1250n);
        expect(r.executorGain).toBe(125n);
        expect(r.guildGain).toBe(1125n);
        expect(r.myGain).toBe(25n);
        expect(await f.diamond(f.U2)).toBe(u2Before + 100n);
        expect(await f.diamond(USER)).toBe(meBefore + 25n);
        expect(await f.pool()).toBe(1125n);
        expect((await f.zone(f.B)).tax).toBe(500n); // 공석 — 동결 유지
        expect((await f.zone(D)).tax).toBe(700n); // 쿨다운 — 유지

        // 두 번째 호출은 걷을 곳이 없다.
        expect(await code(collectAllZoneTax({ userId: USER, serverId: SERVER_ID }, tx))).toBe('NOTHING_TO_COLLECT');
        // 권한 없는 길드원은 거부.
        await f.setRole('member', 0);
        expect(await code(collectAllZoneTax({ userId: USER, serverId: SERVER_ID }, tx))).toBe('NO_PERMISSION');
        throw ROLLBACK;
      })
      .catch((e) => {
        if (e !== ROLLBACK) throw e;
      });
  });
});
