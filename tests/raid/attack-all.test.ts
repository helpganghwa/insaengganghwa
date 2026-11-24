import { afterAll, afterEach, describe, expect, it } from 'vitest';

import { attackRaidAll } from '@/lib/game/raid/attack-all';
import { RAID_BASE_ATTACKS } from '@/lib/game/balance';

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
describe.skipIf(skip)('attackRaidAll — DB 통합(남은 공격 한 번에)', () => {
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

  /** 반복 RNG — 공격마다 [크리 판정, 분산] 쌍을 돌려 쓴다(seqRng는 마지막 값에서 멈춘다). */
  const cycleRng = (vals: number[]) => { let i = 0; return () => vals[i++ % vals.length]!; };
  const q = async <T,>(s: ReturnType<typeof sql>) => (await testDb.execute(s)) as unknown as T[];

  it('남은 공격 수만큼 한 줄씩 기록·횟수 소진·합계 일치', async () => {
    const raidId = await makeRaid({ attacksUsed: 3 });
    // 7번 모두 크리 아님(9999)·분산 0 → 공격마다 같은 피해
    const res = await attackRaidAll({ userId: TEST_USER_ID, raidId, rng: cycleRng([9999, 0]) });
    expect(res.count).toBe(7);
    expect(res.crits).toBe(0);

    const part = await q<{ au: number; td: string }>(sql`select attacks_used au, total_damage::text td from raid_participants where raid_id=${raidId.toString()}::bigint`);
    expect(Number(part[0]?.au)).toBe(RAID_BASE_ATTACKS);
    expect(part[0]?.td).toBe(String(res.damage));

    const atk = await q<{ seq: number; d: string; ex: boolean }>(sql`select seq, damage::text d, is_extra ex from raid_attacks where raid_id=${raidId.toString()}::bigint order by seq`);
    expect(atk.map((a) => Number(a.seq))).toEqual([4, 5, 6, 7, 8, 9, 10]);
    expect(atk.reduce((s, a) => s + Number(a.d), 0)).toBe(res.damage);
    expect(atk.every((a) => a.ex === false)).toBe(true);
  });

  it('이미 산 추가 공격도 남은 공격에 포함되고 is_extra로 기록', async () => {
    const raidId = await makeRaid({ attacksUsed: RAID_BASE_ATTACKS, extraAttacks: 2 });
    const res = await attackRaidAll({ userId: TEST_USER_ID, raidId, rng: seqRng([9999, 0]) });
    expect(res.count).toBe(2);
    const atk = await q<{ ex: boolean }>(sql`select is_extra ex from raid_attacks where raid_id=${raidId.toString()}::bigint`);
    expect(atk.length).toBe(2);
    expect(atk.every((a) => a.ex === true)).toBe(true);
  });

  it('치명타는 공격마다 따로 판정', async () => {
    const raidId = await makeRaid({ attacksUsed: 8 });
    // 1번째: 크리(0), 분산 0 / 2번째: 크리 아님(9999), 분산 0
    const res = await attackRaidAll({ userId: TEST_USER_ID, raidId, rng: seqRng([0, 0, 9999, 0]) });
    expect(res.count).toBe(2);
    expect(res.crits).toBe(1);
  });

  it('멱등: 같은 키 재요청은 횟수를 다시 먹지 않고 같은 합계를 돌려준다', async () => {
    const KEY = '44444444-4444-4444-4444-444444444444';
    const raidId = await makeRaid({ attacksUsed: 5 });
    const first = await attackRaidAll({ userId: TEST_USER_ID, raidId, idemKey: KEY, rng: seqRng([9999, 0]) });
    const again = await attackRaidAll({ userId: TEST_USER_ID, raidId, idemKey: KEY, rng: seqRng([0, 0]) });
    expect(again.count).toBe(first.count);
    expect(again.damage).toBe(first.damage);
    expect(again.crits).toBe(first.crits);
    const n = await q<{ n: number }>(sql`select count(*)::int n from raid_attacks where raid_id=${raidId.toString()}::bigint`);
    expect(Number(n[0]?.n)).toBe(5);
  });

  it('NO_ATTACKS: 남은 공격이 없으면 거부', async () => {
    const raidId = await makeRaid({ attacksUsed: RAID_BASE_ATTACKS });
    await expect(attackRaidAll({ userId: TEST_USER_ID, raidId, rng: seqRng([9999, 0]) })).rejects.toMatchObject({ code: 'NO_ATTACKS' });
  });

  it('NOT_PARTICIPANT: 참여자 아님 거부', async () => {
    const raidId = await makeRaid({ withParticipant: false });
    await expect(attackRaidAll({ userId: TEST_USER_ID, raidId, rng: seqRng([0, 0]) })).rejects.toMatchObject({ code: 'NOT_PARTICIPANT' });
  });
});
