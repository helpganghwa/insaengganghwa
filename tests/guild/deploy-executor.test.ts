import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { deployToZone } from '@/lib/game/guild/conquest/deploy';
import { isConquestLocked, nextBattleKstDay } from '@/lib/game/guild/conquest/schedule';

import { endTestDb, sql, testDb } from '../db';

const TEST_USER_ID = process.env.TEST_USER_ID ?? '';
// conquest 락 윈도(KST 23:00~01:00)엔 deployToZone이 BATTLE_IN_PROGRESS로 막혀 skip(시간대 flaky 회피).
const skip = !TEST_USER_ID || isConquestLocked();
const SERVER_ID = 1;

/**
 * deployToZone 집행관 자동 해제 회귀(§5.4) — 2026-07-27 변경(c1368cb7) 보호.
 * 배치를 등록하면 그 유저의 집행관(자동 방어)이 자동 해제돼야 한다("1인=집행관 or 배치" 불변식).
 * 공유 conquest 상태(길드 멤버십·zone 소유/집행관)를 건드리므로 스테이징 전용 + 철저한 save/restore.
 */
describe.skipIf(skip)('deployToZone — 집행관 자동 해제 회귀', () => {
  let guildId: bigint | null = null;
  let zoneId: number | null = null;
  let savedZone: { owner: string | null; executor: string | null; cap: string | null } | null = null;
  let savedMembership: { guildId: string; role: string } | null = null;
  /** 원래 거주 구역 — 배치가 거주를 요구하게 되어(0139) 테스트에서 옮겼다가 되돌린다. */
  let savedResidence: number | null = null;

  beforeAll(async () => {
    // 1) 기존 멤버십 저장 후 제거(guild_members PK=user_id,server_id — 1유저 1길드).
    const m = (await testDb.execute(sql`
      select guild_id::text gid, role::text role from guild_members
      where user_id=${TEST_USER_ID}::uuid and server_id=${SERVER_ID}`)) as unknown as { gid: string; role: string }[];
    if (m[0]) {
      savedMembership = { guildId: m[0].gid, role: m[0].role };
      await testDb.execute(sql`delete from guild_members where user_id=${TEST_USER_ID}::uuid and server_id=${SERVER_ID}`);
    }

    // 2) throwaway 길드 + 리더 멤버십.
    const name = `테스트길드-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const g = (await testDb.execute(sql`
      insert into guilds (name, leader_user_id, server_id)
      values (${name}, ${TEST_USER_ID}::uuid, ${SERVER_ID}) returning id::text id`)) as unknown as { id: string }[];
    guildId = BigInt(g[0]!.id);
    await testDb.execute(sql`
      insert into guild_members (user_id, server_id, guild_id, role)
      values (${TEST_USER_ID}::uuid, ${SERVER_ID}, ${guildId.toString()}::bigint, 'leader')`);

    // 3) zone A 저장 후 (내 길드 소유 + TEST_USER 집행관)으로 세팅.
    const z = (await testDb.execute(sql`
      select id, owner_guild_id::text owner, executor_user_id::text executor, captured_at::text cap
      from zones where server_id=${SERVER_ID} order by id limit 1`)) as unknown as { id: number; owner: string | null; executor: string | null; cap: string | null }[];
    zoneId = Number(z[0]!.id);
    savedZone = { owner: z[0]!.owner, executor: z[0]!.executor, cap: z[0]!.cap };
    await testDb.execute(sql`
      update zones set owner_guild_id=${guildId.toString()}::bigint, executor_user_id=${TEST_USER_ID}::uuid
      where id=${zoneId}`);

    // 이동·거주 필수(0139) — 배치하려면 그 구역 거주자여야 한다. 원래 값은 afterAll에서 복원.
    const c = (await testDb.execute(sql`
      select residence_zone_id::text rz from characters
      where user_id=${TEST_USER_ID}::uuid and server_id=${SERVER_ID}`)) as unknown as {
      rz: string | null;
    }[];
    savedResidence = c[0]?.rz != null ? Number(c[0].rz) : null;
    await testDb.execute(sql`
      update characters set residence_zone_id=${zoneId}
      where user_id=${TEST_USER_ID}::uuid and server_id=${SERVER_ID}`);
  });

  afterAll(async () => {
    try {
      await testDb.execute(sql`delete from guild_battle_deployments where user_id=${TEST_USER_ID}::uuid and server_id=${SERVER_ID} and battle_kst_day=${nextBattleKstDay()}::date`);
    } catch {}
    if (zoneId != null && savedZone) {
      try {
        await testDb.execute(sql`
          update zones set owner_guild_id=${savedZone.owner}::bigint,
            executor_user_id=${savedZone.executor}::uuid, captured_at=${savedZone.cap}::timestamptz
          where id=${zoneId}`);
      } catch {}
    }
    try {
      await testDb.execute(sql`
        update characters set residence_zone_id=${savedResidence}
        where user_id=${TEST_USER_ID}::uuid and server_id=${SERVER_ID}`);
    } catch {}
    try { await testDb.execute(sql`delete from guild_members where user_id=${TEST_USER_ID}::uuid and server_id=${SERVER_ID}`); } catch {}
    if (guildId != null) { try { await testDb.execute(sql`delete from guilds where id=${guildId.toString()}::bigint`); } catch {} }
    if (savedMembership) {
      try {
        await testDb.execute(sql`
          insert into guild_members (user_id, server_id, guild_id, role)
          values (${TEST_USER_ID}::uuid, ${SERVER_ID}, ${savedMembership.guildId}::bigint, ${savedMembership.role}::guild_role)`);
      } catch {}
    }
    await endTestDb();
  });

  it('배치 등록 시 집행관 자동 해제 + 배치 행 생성', async () => {
    // 사전: TEST_USER = zone A 집행관.
    const before = (await testDb.execute(sql`select executor_user_id::text ex from zones where id=${zoneId!}`)) as unknown as { ex: string | null }[];
    expect(before[0]?.ex).toBe(TEST_USER_ID);

    // 자기 길드 소유 zone A에 수비 배치 — 과거엔 IS_EXECUTOR로 막혔으나 이제 허용.
    const r = await deployToZone({ userId: TEST_USER_ID, serverId: SERVER_ID, zoneId: zoneId!, role: 'defend' });
    expect(r.battleKstDay).toBe(nextBattleKstDay());

    // 회귀 핵심: 집행관 자동 해제.
    const after = (await testDb.execute(sql`select executor_user_id::text ex from zones where id=${zoneId!}`)) as unknown as { ex: string | null }[];
    expect(after[0]?.ex).toBeNull();

    // 배치 행 생성 확인.
    const dep = (await testDb.execute(sql`
      select role::text role from guild_battle_deployments
      where user_id=${TEST_USER_ID}::uuid and zone_id=${zoneId!} and battle_kst_day=${nextBattleKstDay()}::date`)) as unknown as { role: string }[];
    expect(dep.length).toBe(1);
    expect(dep[0]?.role).toBe('defend');
  });
});
