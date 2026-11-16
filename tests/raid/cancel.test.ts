import { afterAll, afterEach, describe, expect, it } from 'vitest';

import { cancelHostedRaid, leaveRaid } from '@/lib/game/raid/cancel';
import { RaidError, openRaid } from '@/lib/game/raid/open';
import { kstDateString } from '@/lib/kst';

import { endTestDb, sql, testDb } from '../db';

const T = process.env.TEST_USER_ID ?? '';
const G = '9ea03a3c-41f2-4f4b-b793-da16a14402b2'; // 규규 — 남이 소환한 레이드의 소환자
const S = 1;
const q = async <R,>(s: ReturnType<typeof sql>): Promise<R[]> => (await testDb.execute(s)) as unknown as R[];
const code = async (p: Promise<unknown>): Promise<string> => {
  try {
    await p;
    return 'OK';
  } catch (e) {
    return e instanceof RaidError ? e.code : `THROWN:${(e as Error).message}`;
  }
};

/**
 * 레이드 취소(11-16) DB 통합 — 참여 취소(10분·공격 0회·횟수 복구)와 소환 취소(다른 참가자 0명·소환비 환불·횟수 복구).
 * 레이드는 직접 INSERT, 끝나면 지운다. 테스트 계정의 그날 횟수·다이아는 처음 값으로 되돌린다.
 */
describe.skipIf(!T)('레이드 취소 — DB 통합', () => {
  const day = kstDateString();
  const made: string[] = [];
  let dailyBefore: number | null = null;
  let diamondBefore = 0n;

  async function snapshot() {
    const [d] = await q<{ c: number }>(sql`select started_count as c from raid_daily_counts where user_id=${T}::uuid and server_id=${S} and kst_date=${day}::date`);
    dailyBefore = d ? Number(d.c) : null;
    const [w] = await q<{ d: string }>(sql`select diamond::text as d from characters where user_id=${T}::uuid and server_id=${S}`);
    diamondBefore = BigInt(w!.d);
  }
  async function setDaily(n: number) {
    await testDb.execute(sql`insert into raid_daily_counts (user_id, server_id, kst_date, started_count) values (${T}::uuid, ${S}, ${day}::date, ${n})
      on conflict (user_id, server_id, kst_date) do update set started_count = ${n}`);
  }
  async function daily(): Promise<number> {
    const [d] = await q<{ c: number }>(sql`select started_count as c from raid_daily_counts where user_id=${T}::uuid and server_id=${S} and kst_date=${day}::date`);
    return Number(d?.c ?? 0);
  }
  async function makeRaid(host: string): Promise<string> {
    const [r] = await q<{ id: string }>(sql`
      insert into raids (server_id, host_user_id, boss_code, phase1_hp, share_code, expire_at)
      values (${S}, ${host}::uuid, 'slime_king'::raid_boss, ${'1000000000'}::bigint, ${`test-cancel-${Date.now()}-${Math.floor(Math.random() * 1e6)}`}, now() + interval '1 hour')
      returning id::text as id`);
    made.push(r!.id);
    await testDb.execute(sql`insert into raid_participants (raid_id, user_id) values (${r!.id}::bigint, ${host}::uuid)`);
    return r!.id;
  }

  afterEach(async () => {
    for (const id of made.splice(0)) {
      await testDb.execute(sql`delete from raid_attacks where raid_id=${id}::bigint`);
      await testDb.execute(sql`delete from raids where id=${id}::bigint`);
      await testDb.execute(sql`delete from diamond_ledger where user_id=${T}::uuid and ref in (${`raid_open:${id}`}, ${`raid_open_refund:${id}`})`);
    }
    if (dailyBefore === null) await testDb.execute(sql`delete from raid_daily_counts where user_id=${T}::uuid and server_id=${S} and kst_date=${day}::date`);
    else await setDaily(dailyBefore);
    await testDb.execute(sql`update characters set diamond=${diamondBefore.toString()}::bigint where user_id=${T}::uuid and server_id=${S}`);
  });
  afterAll(async () => {
    await endTestDb();
  });

  it('참여 취소 — 10분 안·공격 0회면 빠지고 횟수 1회를 돌려받는다, 지나거나 공격했으면 막힌다', async () => {
    await snapshot();
    const id = await makeRaid(G);
    await testDb.execute(sql`insert into raid_participants (raid_id, user_id) values (${id}::bigint, ${T}::uuid)`);
    await setDaily(3);
    // 공격했으면 막힌다
    await testDb.execute(sql`update raid_participants set attacks_used=1 where raid_id=${id}::bigint and user_id=${T}::uuid`);
    expect(await code(leaveRaid({ userId: T, serverId: S, raidId: BigInt(id) }))).toBe('CANCEL_NOT_ALLOWED');
    // 10분이 지났으면 막힌다
    await testDb.execute(sql`update raid_participants set attacks_used=0, joined_at=now() - interval '11 minutes' where raid_id=${id}::bigint and user_id=${T}::uuid`);
    expect(await code(leaveRaid({ userId: T, serverId: S, raidId: BigInt(id) }))).toBe('CANCEL_EXPIRED');
    // 정상
    await testDb.execute(sql`update raid_participants set joined_at=now() where raid_id=${id}::bigint and user_id=${T}::uuid`);
    expect(await code(leaveRaid({ userId: T, serverId: S, raidId: BigInt(id) }))).toBe('OK');
    const left = await q(sql`select 1 from raid_participants where raid_id=${id}::bigint and user_id=${T}::uuid`);
    expect(left).toHaveLength(0);
    expect(await daily()).toBe(2);
    // 다른 서버 id로 부르면 없는 레이드
    expect(await code(leaveRaid({ userId: T, serverId: 2, raidId: BigInt(id) }))).toBe('RAID_NOT_FOUND');
  }, 30_000);

  it('소환 취소 — 다른 참가자가 있으면 막히고, 혼자면 레이드를 지우고 낸 소환비·횟수를 돌려준다', async () => {
    await snapshot();
    const id = await makeRaid(T);
    await setDaily(2);
    // 낸 소환비 기록(11-16부터 ref = raid_open:<id>) — 지갑에서 200을 뺀 것처럼 맞춰 둔다.
    await testDb.execute(sql`update characters set diamond = diamond - 200 where user_id=${T}::uuid and server_id=${S}`);
    await testDb.execute(sql`insert into diamond_ledger (user_id, server_id, delta, reason, ref) values (${T}::uuid, ${S}, -200, 'raid_open', ${`raid_open:${id}`})`);
    // 다른 참가자가 있으면 막힌다
    await testDb.execute(sql`insert into raid_participants (raid_id, user_id) values (${id}::bigint, ${G}::uuid)`);
    expect(await code(cancelHostedRaid({ userId: T, serverId: S, raidId: BigInt(id) }))).toBe('CANCEL_NOT_ALLOWED');
    await testDb.execute(sql`delete from raid_participants where raid_id=${id}::bigint and user_id=${G}::uuid`);
    // 남이 부르면 막힌다
    expect(await code(cancelHostedRaid({ userId: G, serverId: S, raidId: BigInt(id) }))).toBe('NOT_HOST');
    // 정상 — 환불 200, 레이드 삭제, 횟수 2 → 1, 지갑 원래대로
    const r = await cancelHostedRaid({ userId: T, serverId: S, raidId: BigInt(id) });
    expect(r.refund).toBe(200);
    expect(await q(sql`select 1 from raids where id=${id}::bigint`)).toHaveLength(0);
    expect(await daily()).toBe(1);
    const [w] = await q<{ d: string }>(sql`select diamond::text as d from characters where user_id=${T}::uuid and server_id=${S}`);
    expect(BigInt(w!.d)).toBe(diamondBefore);
    const [led] = await q<{ delta: string }>(sql`select delta::text from diamond_ledger where user_id=${T}::uuid and reason='raid_open_refund' and ref=${`raid_open_refund:${id}`}`);
    expect(Number(led!.delta)).toBe(200);
  }, 30_000);

  it('소환 취소 — 낸 소환비가 없으면(무료 소환) 0을 돌려준다, 이미 지운 레이드는 없는 레이드', async () => {
    await snapshot();
    const id = await makeRaid(T);
    await setDaily(1);
    const r = await cancelHostedRaid({ userId: T, serverId: S, raidId: BigInt(id) });
    expect(r.refund).toBe(0);
    expect(await daily()).toBe(0);
    expect(await code(cancelHostedRaid({ userId: T, serverId: S, raidId: BigInt(id) }))).toBe('RAID_NOT_FOUND');
  }, 30_000);

  it('소환 취소 — 11-16 전에 연 레이드(원장 ref 없음)는 소환 시각(마이크로초)으로 소환비를 찾아 돌려준다', async () => {
    await snapshot();
    const id = await makeRaid(T);
    await setDaily(1);
    await testDb.execute(sql`update characters set diamond = diamond - 200 where user_id=${T}::uuid and server_id=${S}`);
    await testDb.execute(sql`insert into diamond_ledger (user_id, server_id, delta, reason, ref, created_at)
      select ${T}::uuid, ${S}, -200, 'raid_open', null, opened_at from raids where id=${id}::bigint`);
    const r = await cancelHostedRaid({ userId: T, serverId: S, raidId: BigInt(id) });
    expect(r.refund).toBe(200);
    await testDb.execute(sql`delete from diamond_ledger where user_id=${T}::uuid and reason='raid_open' and ref is null and created_at > now() - interval '5 minutes'`);
  }, 30_000);

  it('소환 — 낸 소환비를 원장에 레이드 id로 남기고, 취소하면 그만큼 돌려준다', async () => {
    await snapshot();
    await setDaily(0);
    let opened: { raidId: bigint; cost: number } | null = null;
    try {
      opened = await openRaid({ userId: T, serverId: S, bossCode: 'slime_king' });
    } catch (e) {
      // 동시 진행 칸이 가득 찼거나 다이아가 모자라면(스테이징 계정 상태) 이 경로는 건너뛴다.
      if (e instanceof RaidError && (e.code === 'CONCURRENT_LIMIT' || e.code === 'INSUFFICIENT_DIAMOND')) return;
      throw e;
    }
    made.push(opened.raidId.toString());
    if (opened.cost > 0) {
      const [led] = await q<{ delta: string }>(sql`select delta::text from diamond_ledger where user_id=${T}::uuid and reason='raid_open' and ref=${`raid_open:${opened.raidId}`}`);
      expect(Number(led!.delta)).toBe(-opened.cost);
    }
    const r = await cancelHostedRaid({ userId: T, serverId: S, raidId: opened.raidId });
    expect(r.refund).toBe(opened.cost);
  }, 30_000);
});
