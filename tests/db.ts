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

/** 유저 codex에 없고, **lane 여유 있는 슬롯**의 active catalog_item_id — 테스트 격리. */
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
      and not exists (select 1 from user_codex where user_id = ${userId}::uuid and catalog_item_id = c.id)
    order by c.id limit 1
  `)) as unknown as { id: number }[];
  if (!r[0]) {
    throw new Error(
      '테스트 유저: 모든 슬롯 lane이 가득 찼거나 모든 catalog가 codex에 있음 — 정리 필요',
    );
  }
  return Number(r[0].id);
}

/** 강화 테스트용 fixture: equipment_instance + 'running' 강화 잡 생성. cleanup 반환. */
export async function makeRunningJob(opts: {
  userId: string;
  catalogItemId: number;
  fromLevel: number;
  baseRateBp: number;
  /** elapsed 제어 — 'full'=과거 완료시각(success 유도) / 'zero'=현재 시작·미래 완료(hold/down 유도) */
  timing: 'full' | 'zero';
  fodder?: boolean; // +100 제물 시뮬
}): Promise<{
  instanceId: bigint;
  jobId: bigint;
  fodderInstanceId: bigint | null;
  cleanup: () => Promise<void>;
}> {
  const { userId, catalogItemId, fromLevel, baseRateBp, timing, fodder } = opts;
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
  // 인스턴스
  const inst = (await testDb.execute(sql`
    insert into equipment_instances (user_id, catalog_item_id, enhance_level, transcend_level)
    values (${userId}::uuid, ${catalogItemId}, ${fromLevel}, 0)
    returning id::text id`)) as unknown as { id: string }[];
  const instanceId = BigInt(inst[0]!.id);
  // (선택) 제물
  let fodderInstanceId: bigint | null = null;
  if (fodder) {
    const f = (await testDb.execute(sql`
      insert into equipment_instances (user_id, catalog_item_id, enhance_level, transcend_level)
      values (${userId}::uuid, ${catalogItemId}, 0, 0)
      returning id::text id`)) as unknown as { id: string }[];
    fodderInstanceId = BigInt(f[0]!.id);
  }
  // 잡 — slot_lane은 동시성 충돌 회피 위해 1로(테스트 직렬 가정)
  const startedAt = timing === 'full' ? `now() - interval '1 hour'` : `now()`;
  const completeAt = timing === 'full' ? `now() - interval '1 second'` : `now() + interval '1 hour'`;
  const job = (await testDb.execute(sql`
    insert into enhancement_jobs
      (user_id, equipment_instance_id, slot, slot_lane, from_level, target_level,
       base_rate_bp, duration_ms, started_at, complete_at, total_reduced_ms, fodder_instance_id, status)
    values (${userId}::uuid, ${instanceId.toString()}::bigint, ${slotStr}::slot, ${lane},
       ${fromLevel}, ${fromLevel + 1}, ${baseRateBp}, ${3600000}::bigint,
       ${sql.raw(startedAt)}, ${sql.raw(completeAt)}, 0::bigint,
       ${fodderInstanceId === null ? null : fodderInstanceId.toString()}::bigint, 'running')
    returning id::text id`)) as unknown as { id: string }[];
  const jobId = BigInt(job[0]!.id);

  const cleanup = async () => {
    // 안전 — 실패해도 진행 (best-effort). 의존 순서대로 삭제.
    try {
      await testDb.execute(sql`delete from enhancement_logs where user_id = ${userId}::uuid and equipment_instance_id = ${instanceId.toString()}::bigint`);
    } catch {}
    try {
      await testDb.execute(sql`delete from enhancement_jobs where id = ${jobId.toString()}::bigint`);
    } catch {}
    try {
      // 인스턴스(메인 + 제물)
      await testDb.execute(sql`delete from equipment_instances where id = ${instanceId.toString()}::bigint`);
      if (fodderInstanceId !== null) {
        await testDb.execute(sql`delete from equipment_instances where id = ${fodderInstanceId.toString()}::bigint`);
      }
    } catch {}
    // 이 테스트가 생성한 codex 행만 삭제(catalogItemId가 사전엔 없었음 — pickUnusedCatalogId 보장).
    try {
      await testDb.execute(sql`delete from user_codex where user_id = ${userId}::uuid and catalog_item_id = ${catalogItemId}`);
    } catch {}
  };
  return { instanceId, jobId, fodderInstanceId, cleanup };
}
