import 'server-only';

import { sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { effectiveRateBp, failOutcome, levelAfterFail } from '@/lib/game/balance';
import { EnhanceError } from './queue';

/**
 * (B) 강화 큐 완료 — CLAUDE §6.2 / §11.4. 서버 시계만 신뢰, RNG는 완료 시점
 * 서버에서만(§3.1). **2 왕복**: ① 조인 select(검증·계산용) ② 단일 원자 multi-CTE
 * write(레벨·제물·도감·로그·잡전이 한 문장).
 *
 * 멱등·동시성(§3.4): 인터랙티브 트랜잭션/FOR UPDATE 없이, write 문장 내
 * `update enhancement_jobs ... where status='running' returning`(CTE `j`)이
 * **유일한 직렬화 지점**. 동시 2호출 → 한쪽만 j에 row, 나머지 CTE는 전부 `from j`라
 * j 비면 0행(완전 no-op). applied=0 → 이미 정산/취소(JOB_NOT_FOUND).
 * 단일 SQL 문 = 암시적 원자성(부분 실패 없음, §3.3).
 *
 * 회귀 방어: tests/enhance/resolve.test.ts (success/hold/down/idempotency 4 케이스).
 *
 * - 유저 시도(`requireComplete:false`): 언제든, effective = base×(경과/총)
 * - cron/lazy(`requireComplete:true`): `completeAt <= now()` 인 큐만 (full rate)
 * 결과: 성공(+1) / 유지(안전 실패) / 하락(−1, +52~). **파괴 없음**.
 */
export type ResolveInput = {
  jobId: bigint;
  /** 유저 시도 시 본인 검증. cron은 생략. */
  userId?: string;
  /** true면 완료 시각 도달한 큐만(cron). false면 조기 시도 허용(유저). */
  requireComplete: boolean;
};

export type ResolveOutcome = 'success' | 'hold' | 'down';
export type ResolveResult = {
  jobId: bigint;
  equipmentInstanceId: bigint;
  outcome: ResolveOutcome;
  fromLevel: number;
  toLevel: number;
  effectiveRateBp: number;
};

function rollBp(): number {
  // CLAUDE §3.1 — crypto RNG, 0..9999.
  return crypto.getRandomValues(new Uint32Array(1))[0]! % 10000;
}

type Row = Record<string, unknown>;

export async function resolveEnhance(input: ResolveInput): Promise<ResolveResult> {
  const { jobId, userId, requireComplete } = input;
  const jid = jobId.toString();

  // ── RT1: 검증·계산용 조인 select (락 없음 — 동시성은 RT2 status 가드가 보장) ──
  const ownerCond = userId ? sql` and j.user_id = ${userId}::uuid` : sql``;
  const dueCond = requireComplete ? sql` and j.complete_at <= now()` : sql``;
  const r1 = (await db.execute(sql`
    select j.equipment_instance_id::text     as equipment_instance_id,
           j.user_id::text                   as user_id,
           j.from_level                      as from_level,
           j.base_rate_bp                    as base_rate_bp,
           j.duration_ms::text               as duration_ms,
           j.total_reduced_ms::text          as total_reduced_ms,
           j.fodder_instance_id::text        as fodder_instance_id,
           extract(epoch from j.started_at)  as started_epoch,
           extract(epoch from j.complete_at) as complete_epoch,
           ei.catalog_item_id                as catalog_item_id
    from enhancement_jobs j
    join equipment_instances ei on ei.id = j.equipment_instance_id
    where j.id = ${jid}::bigint and j.status = 'running'${ownerCond}${dueCond}
    limit 1
  `)) as unknown as Row[];
  const job = r1[0];
  if (!job) throw new EnhanceError('JOB_NOT_FOUND'); // 이미 정산/취소/미도래 → 멱등 no-op

  const equipmentInstanceId = BigInt(job.equipment_instance_id as string);
  const catalogItemId = Number(job.catalog_item_id);
  const fromLevel = Number(job.from_level);
  const baseRateBp = Number(job.base_rate_bp);
  const durationMs = String(job.duration_ms);
  const reducedMs = String(job.total_reduced_ms);
  const fodderId = job.fodder_instance_id === null ? null : String(job.fodder_instance_id);

  // 서버 시계 기준 경과/총 (총 = completeAt - startedAt, 단축분은 completeAt에 반영됨).
  // extract(epoch)는 microsecond 소수 → *1000 후 정수 아님. bigint 파라미터로 가기 전 floor.
  const now = Date.now();
  const startMs = Math.floor(Number(job.started_epoch) * 1000);
  const endMs = Math.floor(Number(job.complete_epoch) * 1000);
  const totalMs = Math.max(1, endMs - startMs);
  const elapsedMs = Math.min(totalMs, Math.max(0, now - startMs));
  const effBp = effectiveRateBp(baseRateBp, elapsedMs, totalMs);

  const rolled = rollBp();
  let outcome: ResolveOutcome;
  let toLevel: number;
  if (rolled < effBp) {
    outcome = 'success';
    toLevel = fromLevel + 1;
  } else if (failOutcome(fromLevel) === 'down') {
    outcome = 'down';
    toLevel = levelAfterFail(fromLevel);
  } else {
    outcome = 'hold';
    toLevel = fromLevel;
  }

  // ── RT2: 단일 원자 multi-CTE write. 모든 CTE가 `from j`로 게이팅 →
  //    j(조건부 전이)가 0행이면 전부 no-op(멱등). 단일 문 = 원자성. ──
  const w = (await db.execute(sql`
    with j as (
      update enhancement_jobs
      set status = 'completed'
      where id = ${jid}::bigint and status = 'running'
      returning user_id, equipment_instance_id
    ),
    inst as (
      update equipment_instances ei
      set enhance_level = ${toLevel}
      from j
      where ei.id = j.equipment_instance_id and ${toLevel} <> ${fromLevel}
      returning ei.id
    ),
    fdl as (
      delete from equipment_instances
      using j
      where equipment_instances.id = ${fodderId}::bigint
      returning equipment_instances.id
    ),
    cdx as (
      insert into user_codex (user_id, catalog_item_id, max_enhance_level, max_enhance_reached_at)
      select j.user_id, ${catalogItemId}, ${toLevel}, now() from j
      on conflict (user_id, catalog_item_id) do update
      set max_enhance_level = greatest(user_codex.max_enhance_level, ${toLevel}),
          max_enhance_reached_at = case
            when ${toLevel} > user_codex.max_enhance_level then now()
            else user_codex.max_enhance_reached_at end
      returning user_id
    ),
    lg as (
      insert into enhancement_logs
        (user_id, equipment_instance_id, catalog_item_id, from_level, to_level, result,
         base_rate_bp, effective_rate_bp, elapsed_ms, duration_ms, reduced_ms,
         fodder_instance_id, rolled)
      select j.user_id, j.equipment_instance_id, ${catalogItemId}, ${fromLevel}, ${toLevel},
             ${outcome}::enhance_result, ${baseRateBp}, ${effBp}, ${elapsedMs}::bigint,
             ${durationMs}::bigint, ${reducedMs}::bigint, ${fodderId}::bigint, ${rolled}
      from j
      returning id
    )
    select (select count(*) from j)::int as applied
  `)) as unknown as Row[];

  if (Number(w[0]?.applied ?? 0) === 0) {
    throw new EnhanceError('JOB_NOT_FOUND'); // 동시 정산 패자/이미 처리 → 멱등 no-op
  }

  return { jobId, equipmentInstanceId, outcome, fromLevel, toLevel, effectiveRateBp: effBp };
}
