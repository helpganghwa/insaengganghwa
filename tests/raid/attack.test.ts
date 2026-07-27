import { afterAll, afterEach, describe, expect, it } from 'vitest';

import { attackRaid, buyExtraAttack } from '@/lib/game/raid/attack';
import { RAID_BASE_ATTACKS, raidExtraAttackCost } from '@/lib/game/balance';

import { endTestDb, sql, testDb } from '../db';

const TEST_USER_ID = process.env.TEST_USER_ID ?? '';
const skip = !TEST_USER_ID;
const SERVER_ID = 1;

/** 순차 RNG — 1회차=크리 판정값, 2회차=데미지 분산값. */
function seqRng(vals: number[]): () => number {
  let i = 0;
  return () => vals[Math.min(i++, vals.length - 1)]!;
}

/**
 * attackRaid / buyExtraAttack DB 통합(§5.4) — 레이드 공격 트랜잭션 회귀 방지.
 * attackRaid는 rng 주입으로 크리를 결정화. buyExtraAttack은 idemKey 멱등(이중 차감 방지)을 검증.
 * (gemAttackRaid = buyExtraAttack의 지갑·멱등 + attackRaid의 RNG 공격 조합 — 두 경로가 여기서 커버.)
 * raids/raid_participants fixture는 직접 INSERT, afterEach에서 attacks→participants→raid 순 정리.
 */
describe.skipIf(skip)('attackRaid / buyExtraAttack — DB 통합', () => {
  let cleanupRaid: null | (() => Promise<void>) = null;

  async function makeRaid(opts: {
    attacksUsed?: number;
    extraAttacks?: number;
    withParticipant?: boolean;
    lastBuyKey?: string | null;
  }): Promise<bigint> {
    const shareCode = `test-raid-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const r = (await testDb.execute(sql`
      insert into raids (server_id, host_user_id, boss_code, phase1_hp, share_code, expire_at)
      values (${SERVER_ID}, ${TEST_USER_ID}::uuid, 'slime_king'::raid_boss, ${'1000000000000000'}::bigint,
              ${shareCode}, now() + interval '1 hour')
      returning id::text id`)) as unknown as { id: string }[];
    const raidId = BigInt(r[0]!.id);
    if (opts.withParticipant !== false) {
      await testDb.execute(sql`
        insert into raid_participants (raid_id, user_id, attacks_used, extra_attacks, total_damage, last_buy_key)
        values (${raidId.toString()}::bigint, ${TEST_USER_ID}::uuid, ${opts.attacksUsed ?? 0},
                ${opts.extraAttacks ?? 0}, 0, ${opts.lastBuyKey ?? null}::uuid)`);
    }
    cleanupRaid = async () => {
      try { await testDb.execute(sql`delete from raid_attacks where raid_id = ${raidId.toString()}::bigint`); } catch {}
      try { await testDb.execute(sql`delete from raid_participants where raid_id = ${raidId.toString()}::bigint`); } catch {}
      try { await testDb.execute(sql`delete from raids where id = ${raidId.toString()}::bigint`); } catch {}
    };
    return raidId;
  }

  afterEach(async () => {
    if (cleanupRaid) await cleanupRaid();
    cleanupRaid = null;
  });
  afterAll(async () => {
    await endTestDb();
  });

  it('공격: 크리 반영 + 횟수 차감 + raid_attacks 로그 + 누적 데미지', async () => {
    const raidId = await makeRaid({ attacksUsed: 0 });
    const res = await attackRaid({ userId: TEST_USER_ID, raidId, rng: seqRng([0, 0]) }); // 0%10000<500 → 크리
    expect(res.isCrit).toBe(true);
    expect(res.damage).toBeGreaterThanOrEqual(0);

    const part = (await testDb.execute(sql`select attacks_used au, total_damage::text td from raid_participants where raid_id=${raidId.toString()}::bigint and user_id=${TEST_USER_ID}::uuid`)) as unknown as { au: number; td: string }[];
    expect(Number(part[0]?.au)).toBe(1); // 1회 차감
    expect(part[0]?.td).toBe(String(res.damage)); // 누적 = 이번 데미지

    const atk = (await testDb.execute(sql`select seq, is_crit ic from raid_attacks where raid_id=${raidId.toString()}::bigint`)) as unknown as { seq: number; ic: boolean }[];
    expect(atk.length).toBe(1);
    expect(Number(atk[0]?.seq)).toBe(1);
    expect(atk[0]?.ic).toBe(true);
  });

  it('NO_ATTACKS: 기본 공격 소진 시 거부', async () => {
    const raidId = await makeRaid({ attacksUsed: RAID_BASE_ATTACKS });
    await expect(
      attackRaid({ userId: TEST_USER_ID, raidId, rng: seqRng([9999, 0]) }),
    ).rejects.toMatchObject({ code: 'NO_ATTACKS' });
  });

  it('NOT_PARTICIPANT: 참여자 아님 거부', async () => {
    const raidId = await makeRaid({ withParticipant: false });
    await expect(
      attackRaid({ userId: TEST_USER_ID, raidId, rng: seqRng([0, 0]) }),
    ).rejects.toMatchObject({ code: 'NOT_PARTICIPANT' });
  });

  it('buyExtraAttack 멱등: 같은 idemKey 재요청은 재차감·재구매 없이 기존 상태 반환', async () => {
    const KEY = '11111111-1111-1111-1111-111111111111';
    const raidId = await makeRaid({ extraAttacks: 2, lastBuyKey: KEY });
    const res = await buyExtraAttack({ userId: TEST_USER_ID, serverId: SERVER_ID, raidId, idemKey: KEY });
    expect(res.extraAttacks).toBe(2); // 증가 없음(멱등 복원)
    expect(res.cost).toBe(raidExtraAttackCost(2));

    const part = (await testDb.execute(sql`select extra_attacks ea from raid_participants where raid_id=${raidId.toString()}::bigint and user_id=${TEST_USER_ID}::uuid`)) as unknown as { ea: number }[];
    expect(Number(part[0]?.ea)).toBe(2); // DB 불변 = 재구매 안 함
  });
});
