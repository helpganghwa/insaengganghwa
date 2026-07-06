import 'server-only';

import { sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import {
  effectiveOutcomeProbsBp,
  downRateBp,
  levelAfterFail,
} from '@/lib/game/balance';
import { accrueResidenceTax } from '@/lib/game/guild/tax';
import { logMemberAchievement } from '@/lib/game/guild/achievement';
import { logWorldEvent } from '@/lib/game/world/event';
import { rebuildCodexChampionsForItem } from '@/lib/game/leaderboard/snapshot';
import { refreshEnhanceMetrics } from '@/lib/game/leaderboard/incremental';

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
  /** 테스트용 RNG 주입(0..9999). 기본=crypto. 프로덕션 호출은 절대 지정 금지. */
  rngBp?: () => number;
};

export type ResolveOutcome = 'success' | 'hold' | 'down' | 'mega';
export type ResolveResult = {
  jobId: bigint;
  userEquipmentId: bigint;
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
  const { jobId, userId, requireComplete, rngBp } = input;
  const jid = jobId.toString();

  // ── RT1: 검증·계산용 조인 select (락 없음 — 동시성은 RT2 status 가드가 보장) ──
  const ownerCond = userId ? sql` and j.user_id = ${userId}::uuid` : sql``;
  const dueCond = requireComplete ? sql` and j.complete_at <= now()` : sql``;
  const r1 = (await db.execute(sql`
    select j.user_equipment_id::text         as user_equipment_id,
           j.server_id                       as job_server_id,
           j.user_id::text                   as user_id,
           j.from_level                      as from_level,
           j.base_rate_bp                    as base_rate_bp,
           j.down_rate_bp                    as down_rate_bp,
           j.duration_ms::text               as duration_ms,
           j.total_reduced_ms::text          as total_reduced_ms,
           extract(epoch from j.started_at)  as started_epoch,
           extract(epoch from j.complete_at) as complete_epoch,
           ue.catalog_item_id                as catalog_item_id
    from enhancement_jobs j
    join user_equipment ue on ue.id = j.user_equipment_id
    where j.id = ${jid}::bigint and j.status = 'running'${ownerCond}${dueCond}
    limit 1
  `)) as unknown as Row[];
  const job = r1[0];
  if (!job) throw new EnhanceError('JOB_NOT_FOUND'); // 이미 정산/취소/미도래 → 멱등 no-op

  const userEquipmentId = BigInt(job.user_equipment_id as string);
  const catalogItemId = Number(job.catalog_item_id);
  const fromLevel = Number(job.from_level);
  const baseRateBp = Number(job.base_rate_bp);
  const durationMs = String(job.duration_ms);
  const reducedMs = String(job.total_reduced_ms);

  // 서버 시계 기준 경과/총 (총 = completeAt - startedAt, 단축분은 completeAt에 반영됨).
  // extract(epoch)는 microsecond 소수 → *1000 후 정수 아님. bigint 파라미터로 가기 전 floor.
  const now = Date.now();
  const startMs = Math.floor(Number(job.started_epoch) * 1000);
  const endMs = Math.floor(Number(job.complete_epoch) * 1000);
  const totalMs = Math.max(1, endMs - startMs);
  const elapsedMs = Math.min(totalMs, Math.max(0, now - startMs));
  // BALANCE §1.2 — 3분기 outcome: success(시간 비례) / down(고정) / hold(잔여).
  // baseRate·downRate 모두 등록 시 스냅샷(소급 금지, CLAUDE §6.3). 스냅샷 이전 in-flight 잡은
  // down_rate_bp가 null이라 코드 상수로 폴백(점진 마이그레이션).
  const fixedDownBp =
    job.down_rate_bp != null ? Number(job.down_rate_bp) : downRateBp(fromLevel);
  const probs = effectiveOutcomeProbsBp(baseRateBp, fixedDownBp, elapsedMs, totalMs);
  // 유효 성공률 = success(+1) + mega(+2) 총합 — 화면 표시값(EnhanceSlotCard)과 동일. 감사로그·토스트가
  // 노출확률과 일치하도록(감사 F4). 분기 판정은 아래에서 probs.success/mega/down을 개별 사용하므로 무영향.
  const effBp = probs.success + probs.mega;

  const rolled = (rngBp ?? rollBp)();
  let outcome: ResolveOutcome;
  let toLevel: number;
  // 순서: mega(0..mega) → success(...) → down(...) → hold(...).
  // mega는 success 안에서 분리된 분량이므로 success보다 먼저 판정.
  if (rolled < probs.mega) {
    outcome = 'mega';
    toLevel = fromLevel + 2;
  } else if (rolled < probs.mega + probs.success) {
    outcome = 'success';
    toLevel = fromLevel + 1;
  } else if (rolled < probs.mega + probs.success + probs.down) {
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
      returning user_id, user_equipment_id, server_id
    ),
    ue as (
      update user_equipment u
      set enhance_level = ${toLevel},
          max_enhance_level = greatest(u.max_enhance_level, ${toLevel}),
          max_enhance_reached_at = case
            when ${toLevel} > u.max_enhance_level then now()
            else u.max_enhance_reached_at end
      from j
      where u.id = j.user_equipment_id
      returning u.id
    ),
    lg as (
      insert into enhancement_logs
        (user_id, server_id, user_equipment_id, catalog_item_id, from_level, to_level, result,
         base_rate_bp, effective_rate_bp, elapsed_ms, duration_ms, reduced_ms, rolled)
      select j.user_id, j.server_id, j.user_equipment_id, ${catalogItemId}, ${fromLevel}, ${toLevel},
             ${outcome}::enhance_result, ${baseRateBp}, ${effBp}, ${elapsedMs}::bigint,
             ${durationMs}::bigint, ${reducedMs}::bigint, ${rolled}
      from j
      returning id
    )
    select (select count(*) from j)::int as applied
  `)) as unknown as Row[];

  if (Number(w[0]?.applied ?? 0) === 0) {
    throw new EnhanceError('JOB_NOT_FOUND'); // 동시 정산 패자/이미 처리 → 멱등 no-op
  }

  // 푸시 알림은 '결과 시점' 아닌 'complete_at 도달 시점'(=최대확률)에 cron이 처리(2026-05-26).
  // resolveEnhance는 결과 트랜잭션만 담당, 알림 책임 없음.

  // 리더보드 증분 갱신(v2) — 레벨이 변했을 때만(성공·메가·하락). 유저 1명 스코프 재계산.
  // best-effort: 실패는 시간별 전체 재계산(cron)이 교정 — 강화 결과엔 영향 없음.
  if (toLevel !== fromLevel) {
    try {
      await refreshEnhanceMetrics(String(job.user_id), Number(job.job_server_id));
    } catch {
      // cron 백스톱.
    }
  }

  // 길드 세금 누적(GUILD §5.5) — 성공/mega(레벨 상승) 시 거주 구역에 도달레벨 포인트.
  // **강화 원자 트랜잭션과 분리(best-effort)**: 실패해도 강화 정산엔 영향 없음.
  if (toLevel > fromLevel) {
    try {
      await accrueResidenceTax(String(job.user_id), Number(job.job_server_id), toLevel);
    } catch {
      // 세금 누적 실패는 무시(강화 결과 보존).
    }
    // 해방(아이템 챔피언) 즉시 반영 — 이 아이템 파티션만 부분 재계산(보유자 소수라 저비용).
    // 6/26 스냅샷화로 사라졌던 "내 강화 즉시 선반영" 체감 복원. 실패해도 15분 cron이 백스톱.
    try {
      await rebuildCodexChampionsForItem(Number(job.job_server_id), catalogItemId);
    } catch {
      // 부분 재계산 실패 무시(cron 백스톱).
    }
  }

  // 길드 업적 — 강화 100단위 돌파 시 길드 피드에 노출(best-effort). mega(+2)로 100을 건너뛰어도 경계 통과로 포착.
  if (
    (outcome === 'success' || outcome === 'mega') &&
    Math.floor(toLevel / 100) > Math.floor(fromLevel / 100)
  ) {
    try {
      const milestone = Math.floor(toLevel / 100) * 100;
      const [ci] = (await db.execute(
        sql`select name from catalog_items where id = ${catalogItemId} limit 1`,
      )) as unknown as { name: string }[];
      await logMemberAchievement(String(job.user_id), Number(job.job_server_id), {
        action: 'achv_enhance',
        detail: { item: ci?.name ?? '장비', level: milestone },
      });
      await logWorldEvent(Number(job.job_server_id), 'enhance', { item: ci?.name ?? '장비', level: milestone }, {
        actorUserId: String(job.user_id),
      });
    } catch {
      // 업적 기록 실패 무시.
    }
  }

  return { jobId, userEquipmentId, outcome, fromLevel, toLevel, effectiveRateBp: effBp };
}
