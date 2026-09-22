/**
 * 테스트 전용 DB 클라이언트 — DIRECT_URL(세션 풀러:5432), max:5(prod singleton과 격리).
 * 테스트는 공유 prod DB를 사용하므로 fixture cleanup이 필수(try/finally / afterEach).
 * 테스트 유저는 .env.local의 TEST_USER_ID(실제 가입 계정 재사용 — profiles는
 * auth.users FK 보유라 신규 생성 불가).
 */
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { sql } from 'drizzle-orm';

import * as schema from '@/lib/db/schema';

const url = process.env.DIRECT_URL;
if (!url) throw new Error('DIRECT_URL required for tests (set in .env.local)');

const client = postgres(url, { prepare: false, max: 5, idle_timeout: 10, connect_timeout: 15 });
export const testDb = drizzle(client, { schema });
export { sql };
export async function endTestDb(): Promise<void> {
  await client.end({ timeout: 5 });
}

/**
 * 테스트 계정의 마일리지 지갑을 **원장 합으로 다시 맞춘다**(0211 — 서버별 지갑).
 * 결제 테스트는 completePurchase/refund를 실제로 돌려 원장 행과 지갑 증감을 남긴다. 원장 행만 지우고
 * 지갑을 그대로 두면 실행할 때마다 지갑이 불어난다(원장은 비었는데 지갑 240이던 잔여물, 2026-09-21).
 * 값을 '되돌리는' 대신 원장에서 다시 세우므로, 병렬로 도는 다른 테스트 파일과 엇갈려도 결과가 같다.
 * ⚠ 자기가 만든 원장 행을 **먼저 지운 뒤** 부를 것.
 */
export async function resyncTestMileage(userId: string): Promise<void> {
  await testDb.execute(sql`delete from mileage_wallets where user_id = ${userId}::uuid`);
  await testDb.execute(sql`
    insert into mileage_wallets (user_id, server_id, balance)
    select user_id, server_id, sum(delta) from point_ledger
     where kind = 'mileage' and user_id = ${userId}::uuid and server_id is not null
     group by user_id, server_id having sum(delta) > 0
    on conflict (user_id, server_id) do update set balance = excluded.balance
  `);
}

/** 유저가 미보유이고, **lane 여유 있는 슬롯**의 active catalog_item_id — 테스트 격리. */
export async function pickUnusedCatalogId(userId: string): Promise<number> {
  const r = (await testDb.execute(sql`
    with rc as (
      select slot, count(*)::int n from enhancement_jobs
      where user_id = ${userId}::uuid and status = 'running' group by slot
    )
    select c.id from catalog_items c
    left join rc on rc.slot = c.slot
    where c.active
      and coalesce(rc.n, 0) < 2
      and not exists (select 1 from user_equipment where user_id = ${userId}::uuid and catalog_item_id = c.id)
    order by c.id limit 1
  `)) as unknown as { id: number }[];
  if (!r[0]) {
    throw new Error(
      '테스트 유저: 모든 슬롯 lane이 가득 찼거나 모든 catalog를 보유 중 — 정리 필요',
    );
  }
  return Number(r[0].id);
}

/** 강화 테스트용 fixture: user_equipment 레코드 + 'running' 강화 잡 생성. cleanup 반환. */
export async function makeRunningJob(opts: {
  userId: string;
  catalogItemId: number;
  fromLevel: number;
  baseRateBp: number;
  /** elapsed 제어 — 'full'=과거 완료시각(success 유도) / 'zero'=현재 시작·미래 완료(hold/down 유도) */
  timing: 'full' | 'zero';
}): Promise<{
  /** 강화 대상 user_equipment.id */
  instanceId: bigint;
  jobId: bigint;
  cleanup: () => Promise<void>;
}> {
  const { userId, catalogItemId, fromLevel, baseRateBp, timing } = opts;
  const slot = (await testDb.execute(sql`select slot::text s from catalog_items where id = ${catalogItemId}`)) as unknown as { s: string }[];
  const slotStr = slot[0]!.s;
  // 자유 lane 탐지 — 유저가 같은 slot에 진행 중 잡이 있으면 그 lane 회피
  // (unique partial index: ej_user_slot_lane_running_uq).
  const busy = (await testDb.execute(sql`
    select slot_lane lane from enhancement_jobs
    where user_id = ${userId}::uuid and slot = ${slotStr}::slot and status = 'running'
  `)) as unknown as { lane: number }[];
  const busySet = new Set(busy.map((r) => Number(r.lane)));
  const lane = !busySet.has(1) ? 1 : !busySet.has(2) ? 2 : null;
  if (lane === null) {
    throw new Error(
      `테스트 유저 (${userId}) ${slotStr} 슬롯 두 lane(1,2) 모두 사용 중 — ` +
        `진행 중인 강화를 정리하거나 전용 테스트 계정 사용 권장`,
    );
  }
  // user_equipment 레코드 (카탈로그당 1행 — pickUnusedCatalogId가 미보유 보장)
  const eq = (await testDb.execute(sql`
    insert into user_equipment (user_id, catalog_item_id, enhance_level, transcend_level)
    values (${userId}::uuid, ${catalogItemId}, ${fromLevel}, 0)
    returning id::text id`)) as unknown as { id: string }[];
  const instanceId = BigInt(eq[0]!.id);
  // 잡
  const startedAt = timing === 'full' ? `now() - interval '1 hour'` : `now()`;
  const completeAt = timing === 'full' ? `now() - interval '1 second'` : `now() + interval '1 hour'`;
  const job = (await testDb.execute(sql`
    insert into enhancement_jobs
      (user_id, user_equipment_id, slot, slot_lane, from_level, target_level,
       base_rate_bp, duration_ms, started_at, complete_at, total_reduced_ms, status)
    values (${userId}::uuid, ${instanceId.toString()}::bigint, ${slotStr}::slot, ${lane},
       ${fromLevel}, ${fromLevel + 1}, ${baseRateBp}, ${3600000}::bigint,
       ${sql.raw(startedAt)}, ${sql.raw(completeAt)}, 0::bigint, 'running')
    returning id::text id`)) as unknown as { id: string }[];
  const jobId = BigInt(job[0]!.id);

  const cleanup = async () => {
    // 안전 — 실패해도 진행 (best-effort). 의존 순서대로 삭제.
    try {
      await testDb.execute(sql`delete from enhancement_logs where user_id = ${userId}::uuid and user_equipment_id = ${instanceId.toString()}::bigint`);
    } catch {}
    try {
      await testDb.execute(sql`delete from enhancement_jobs where id = ${jobId.toString()}::bigint`);
    } catch {}
    try {
      await testDb.execute(sql`delete from user_equipment where id = ${instanceId.toString()}::bigint`);
    } catch {}
  };
  return { instanceId, jobId, cleanup };
}
