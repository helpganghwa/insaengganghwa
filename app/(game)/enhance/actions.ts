'use server';

import { revalidatePath } from 'next/cache';
import { after } from 'next/server';
import { and, eq, sql } from 'drizzle-orm';

import { getSessionUserId } from '@/lib/auth/session';
import { makeErr, type ErrorResult } from '@/lib/game/action-result';
import { rateLimited } from '@/lib/ratelimit';
import { actionBlock } from '@/lib/game/action-gate';
import { getActiveServerId } from '@/lib/game/servers';
import { db } from '@/lib/db/client';
import { enhancementJobs } from '@/lib/db/schema/enhance';
import { catalogItems, userEquipment, type Slot } from '@/lib/db/schema/equipment';
import {
  queueEnhance,
  resolveEnhance,
  reduceEnhanceTime,
  cancelEnhance,
  swapEnhance,
  EnhanceError,
  type ResolveResult,
} from '@/lib/game/enhance';
import { getMyRanks, getMyRanksAfter, type MyRanks } from '@/lib/game/leaderboard/queries';
import { GEM_TO_MS } from '@/lib/game/balance';

/**
 * push_pending(='enhance')에서 해당 jobId를 가진 element 제거.
 * 사용자가 알림 발송 전(=push-flush 30분 도래 전) 잡을 직접 처리한 경우,
 * 누적된 items에서 그 jobId를 빼서 "이미 처리된 잡까지 묶음 알림"이 안 가도록.
 * items 비면 row 자체 삭제(다음 cron에서 빈 묶음 발송 미연 방지).
 * best-effort — 실패해도 강화 결과 자체는 정상 반환.
 */
async function cleanupPushPendingJob(userId: string, jobId: string): Promise<void> {
  try {
    await db.execute(sql`
      update push_pending
      set items = coalesce(
        (select jsonb_agg(elem) from jsonb_array_elements(items) elem where elem->>'jobId' <> ${jobId}),
        '[]'::jsonb
      ),
      updated_at = now()
      where user_id = ${userId}::uuid and category = 'enhance'::push_category
    `);
    await db.execute(sql`
      delete from push_pending
      where user_id = ${userId}::uuid
        and category = 'enhance'::push_category
        and jsonb_array_length(items) = 0
    `);
  } catch (e) {
    console.error('[push_pending.cleanup]', e);
  }
}

type ErrorState = ErrorResult;

const MSG: Record<string, string> = {
  EQUIPMENT_NOT_FOUND: '장비를 찾을 수 없습니다.',
  ALREADY_ENHANCING: '이미 강화 중인 장비입니다.',
  SLOT_BUSY: '같은 부위 슬롯이 모두 사용 중입니다.',
  JOB_NOT_FOUND: '강화 작업을 찾을 수 없습니다.',
  INSUFFICIENT_DIAMOND: '다이아가 부족합니다.',
  UNAUTHENTICATED: '로그인이 필요합니다.',
  RATE_LIMITED: '요청이 너무 빠릅니다. 잠시 후 다시 시도해 주세요.',
  MAINTENANCE: '서버 점검 중입니다. 잠시 후 다시 시도해 주세요.',
  BANNED: '이용이 제한된 계정입니다.',
  UNKNOWN: '알 수 없는 오류',
};

const err = makeErr(MSG);

/**
 * 클라가 넘긴 jobId를 안전하게 bigint로 — 낙관적 잡 id('optimistic-<catalogId>')처럼
 * 수치가 아닌 값이 `BigInt()`에 새어 SyntaxError로 크래시하던 것 방지(등록 확정 전 보석 단축·
 * 취소 등). 수치가 아니면 null → 호출부는 JOB_NOT_FOUND로 강등(정상 잡 아님).
 */
function toJobId(jobId: string): bigint | null {
  return /^\d+$/.test(jobId) ? BigInt(jobId) : null;
}

function revalidateAll() {
  revalidatePath('/');
  revalidatePath('/enhance');
  revalidatePath('/inventory');
}

async function uid(): Promise<string | null> {
  return getSessionUserId();
}

/** (A) 큐 등록 — 강화 무료(자원·제물 없음). 대상은 user_equipment 레코드 id. */
export async function startEnhance(userEquipmentId: string) {
  const userId = await uid();
  if (!userId) return err('UNAUTHENTICATED');
  if (await rateLimited(userId, 'enhance')) return err('RATE_LIMITED');
  const __b = await actionBlock(); if (__b) return err(__b);
  try {
    const result = await queueEnhance({ userId, userEquipmentId: BigInt(userEquipmentId) });
    revalidateAll();
    return { status: 'success' as const, jobId: result.jobId.toString() };
  } catch (e) {
    if (e instanceof EnhanceError) return err(e.code);
    console.error('[enhance.queue]', e);
    return err('UNKNOWN');
  }
}

/**
 * (B) 강화 시도 — 유저 조기 시도 허용(effective rate). 결과 무관 서버 자동 재등록(실패/유지/하락도 슬롯 유지).
 * 토스트용 ranks before/after 동봉(상승/하락 모두 표시, 클라이언트가 디바운스/노출 판단).
 */
/** 자동 재등록된 다음 잡 — 응답에 실어 클라가 router.refresh 없이 게이지를 즉시 리셋한다.
 *  (불변 필드 code/name/slot/transcend는 같은 장비라 클라가 기존 카드에서 유지·병합.) */
export type NextJobDto = {
  jobId: string;
  fromLevel: number;
  targetLevel: number;
  baseRateBp: number;
  /** 등록 시점 downRate 스냅샷(bp). null=스냅샷 이전 레거시 잡 — 클라가 코드 상수로 폴백.
   *  클라가 상수를 재계산하면 하락률 조정 후 진행 중 잡의 표시가 판정과 어긋난다(CLAUDE §6.3). */
  downRateBp: number | null;
  startedAtIso: string;
  completeAtIso: string;
};

export async function finalizeEnhance(jobId: string): Promise<
  | {
      status: 'success';
      result: Omit<ResolveResult, 'jobId' | 'userEquipmentId' | 'slotLane'>;
      requeued: boolean;
      /** 재등록 성공 시 다음 잡 정보(없으면 null — MAX 도달 등). */
      nextJob: NextJobDto | null;
      ranksBefore: MyRanks;
      ranksAfter: MyRanks;
    }
  | ErrorState
> {
  const userId = await uid();
  if (!userId) return err('UNAUTHENTICATED');
  if (await rateLimited(userId, 'enhance')) return err('RATE_LIMITED');
  const __b = await actionBlock(); if (__b) return err(__b);
  try {
    const serverId = await getActiveServerId(); // 쿠키 파생 — before/after 재사용(중복 호출 제거).
    // 강화 직전 — 캐시 시점 본인 3 메트릭 + 순위(토스트 before).
    const ranksBefore = await getMyRanks(userId, serverId);

    // 결과 판정·저장 원자 트랜잭션(CLAUDE §3.1/§3.3/§3.4).
    const jid = toJobId(jobId);
    if (jid == null) return err('JOB_NOT_FOUND');
    const r = await resolveEnhance({ jobId: jid, userId });

    // 결과 무관 자동 재등록(GDD §3.2 갱신 — 실패도 슬롯 유지) — **응답 내에서
    // await** 해야 함. 백그라운드(after)로 빼면 응답 후 router.refresh가 새 잡
    // 생성 전에 /enhance를 재렌더해 슬롯이 빈 상태로 깜빡임(레이스, 검증됨).
    // best-effort·멱등 — MAX 레벨 도달 등으로 큐잉 실패는 흡수(슬롯 자연 해제).
    let requeued = false;
    let nextJob: NextJobDto | null = null;
    try {
      // preferredLane — 방금 정산한 잡의 lane 유지(반대 lane이 비어도 점프 금지, 카드 위치 고정).
      const nq = await queueEnhance({ userId, userEquipmentId: r.userEquipmentId, preferredLane: r.slotLane });
      requeued = true;
      // started_at = completeAt − durationMs(queue가 now()+duration으로 stamp). 클라 게이지 기준.
      nextJob = {
        jobId: String(nq.jobId),
        fromLevel: nq.fromLevel,
        targetLevel: nq.targetLevel,
        baseRateBp: nq.baseRateBp,
        downRateBp: nq.downRateBp,
        completeAtIso: nq.completeAt.toISOString(),
        startedAtIso: new Date(nq.completeAt.getTime() - nq.durationMs).toISOString(),
      };
    } catch (re) {
      if (!(re instanceof EnhanceError)) console.error('[enhance.requeue]', re);
    }
    // 강화 직후 — 본인 새 stat 직접 fetch + 캐시 sorted bisect(토스트 after).
    const ranksAfter = await getMyRanksAfter(userId, serverId);
    // 묶음 알림에서 이미 처리된 잡 제거 — best-effort·응답 결과 무관이라 after()로 응답 후 실행
    // (핫패스에서 UPDATE+DELETE 2왕복 제거, 2026-07-27). 다음 cron이 빈 묶음 발송 안 함.
    after(() => cleanupPushPendingJob(userId, jobId));
    // 변경 데이터만 무효화(홈 '/'은 다음 방문 시 자연 갱신 — 핫패스 축소).
    revalidatePath('/enhance');
    revalidatePath('/inventory');
    return {
      status: 'success',
      result: {
        outcome: r.outcome,
        fromLevel: r.fromLevel,
        toLevel: r.toLevel,
        effectiveRateBp: r.effectiveRateBp,
      },
      requeued,
      nextJob,
      ranksBefore,
      ranksAfter,
    };
  } catch (e) {
    if (e instanceof EnhanceError) return err(e.code);
    console.error('[enhance.resolve]', e);
    return err('UNKNOWN');
  }
}

/**
 * 자동 강화 — 클라 구동 하이브리드 루프의 "한 스텝"(경제 sink 로드맵 Phase 0).
 * 현재 잡을 💎로 완료까지 단축 → 판정 → 다음 레벨 재등록을 1회 수행하고 결과 반환.
 * 서버 권위(💎·RNG·시간)로 reduceEnhanceTime+resolveEnhance+queueEnhance를 조합.
 * 정지조건 중 예산은 budgetLeft로 스텝 단위 서버 가드(부족 시 미차감·stop) — 클라가 누적 판정.
 * ⚠ 현재 = 액티브 전용(A). 세션 영속(두 탭 공유 예산·오프라인 캐치업 B2)은 후속.
 */
export async function autoEnhanceStepAction(
  jobId: string,
  budgetLeft: number,
): Promise<
  | { status: 'ok'; outcome: string; fromLevel: number; toLevel: number; gemsSpent: number; nextJob: NextJobDto | null }
  | { status: 'stop'; reason: 'budget' | 'insufficient' | 'gone' }
  | ErrorState
> {
  const userId = await uid();
  if (!userId) return err('UNAUTHENTICATED');
  // 다른 강화 액션과 동일 버킷(30/10s) — 정상 자동 페이스(~4/10s)엔 무영향, 직접 호출 스팸만 감속.
  if (await rateLimited(userId, 'enhance')) return err('RATE_LIMITED');
  const __b = await actionBlock();
  if (__b) return err(__b);
  const jid = toJobId(jobId);
  if (jid == null) return { status: 'stop', reason: 'gone' };
  try {
    // 현재 잡 남은 시간 → 완료에 필요한 💎(1💎=1분).
    const [job] = await db
      .select({ completeAt: enhancementJobs.completeAt })
      .from(enhancementJobs)
      .where(
        and(
          eq(enhancementJobs.id, jid),
          eq(enhancementJobs.userId, userId),
          eq(enhancementJobs.status, 'running'),
        ),
      )
      .limit(1);
    if (!job) return { status: 'stop', reason: 'gone' };

    const remainingMs = job.completeAt.getTime() - Date.now();
    const gemsNeeded = remainingMs > 0 ? Math.ceil(remainingMs / GEM_TO_MS) : 0;
    if (gemsNeeded > Math.max(0, Math.floor(budgetLeft))) return { status: 'stop', reason: 'budget' };

    if (gemsNeeded > 0) {
      try {
        await reduceEnhanceTime({ userId, jobId: jid, diamonds: gemsNeeded });
      } catch (e) {
        if (e instanceof EnhanceError && e.code === 'INSUFFICIENT_DIAMOND')
          return { status: 'stop', reason: 'insufficient' };
        throw e;
      }
    }

    const r = await resolveEnhance({ jobId: jid, userId });
    // 묶음 알림 대기열에서 이 잡 제거(finalize와 동일) — 오래 방치돼 '준비완료' push_pending에
    // 적재된 잡을 자동이 정산한 경우, 30분 뒤 스테일 푸시가 나가는 것 방지. best-effort·응답 후.
    after(() => cleanupPushPendingJob(userId, jobId));

    let nextJob: NextJobDto | null = null;
    try {
      // preferredLane — 자동 체인이 반대 lane이 비어도 같은 자리 유지(카드 점프/겹침 방지).
      const nq = await queueEnhance({ userId, userEquipmentId: r.userEquipmentId, preferredLane: r.slotLane });
      nextJob = {
        jobId: String(nq.jobId),
        fromLevel: nq.fromLevel,
        targetLevel: nq.targetLevel,
        baseRateBp: nq.baseRateBp,
        downRateBp: nq.downRateBp,
        completeAtIso: nq.completeAt.toISOString(),
        startedAtIso: new Date(nq.completeAt.getTime() - nq.durationMs).toISOString(),
      };
    } catch (re) {
      if (!(re instanceof EnhanceError)) console.error('[auto.requeue]', re); // MAX 등은 정상 종료
    }

    return {
      status: 'ok',
      outcome: r.outcome,
      fromLevel: r.fromLevel,
      toLevel: r.toLevel,
      gemsSpent: gemsNeeded,
      nextJob,
    };
  } catch (e) {
    if (e instanceof EnhanceError) return err(e.code);
    console.error('[auto.step]', e);
    return err('UNKNOWN');
  }
}

/** (C) 보석 단축 */
export async function reduceTimeWithGems(jobId: string, diamonds: number) {
  const userId = await uid();
  if (!userId) return err('UNAUTHENTICATED');
  if (await rateLimited(userId, 'enhance')) return err('RATE_LIMITED');
  const __b = await actionBlock(); if (__b) return err(__b);
  try {
    const jid = toJobId(jobId);
    if (jid == null) return err('JOB_NOT_FOUND');
    const result = await reduceEnhanceTime({ userId, jobId: jid, diamonds });
    revalidateAll();
    return {
      status: 'success' as const,
      completeAt: result.completeAt.toISOString(),
      ready: result.ready,
    };
  } catch (e) {
    if (e instanceof EnhanceError) return err(e.code);
    console.error('[enhance.reduce]', e);
    return err('UNKNOWN');
  }
}

/** (D) 취소 — 환불 없음, lane 해제 */
export async function cancelEnhanceAction(jobId: string) {
  const userId = await uid();
  if (!userId) return err('UNAUTHENTICATED');
  // 취소 전용 버킷 — 짧은 시간 다중 취소 폭주(슬롯 전멸 사건) 차단. 정상 조작은 컨펌 때문에 도달 불가.
  if (await rateLimited(userId, 'enhanceCancel')) return err('RATE_LIMITED');
  const __b = await actionBlock(); if (__b) return err(__b);
  try {
    const jid = toJobId(jobId);
    if (jid == null) return err('JOB_NOT_FOUND');
    await cancelEnhance({ userId, jobId: jid });
    revalidateAll();
    return { status: 'success' as const };
  } catch (e) {
    if (e instanceof EnhanceError) return err(e.code);
    console.error('[enhance.cancel]', e);
    return err('UNKNOWN');
  }
}

/**
 * 같은 슬롯의 강화중 jobs 조회 — 인벤토리 강화 시작 시 SLOT_BUSY면 이걸로
 * 교체 후보 목록을 보여줌(SwapPickerModal). slot은 catalog.slot 기준.
 */
export async function getActiveJobsForSlot(slot: Slot) {
  const userId = await uid();
  if (!userId) return err('UNAUTHENTICATED');
  try {
  const rows = await db
    .select({
      jobId: enhancementJobs.id,
      userEquipmentId: enhancementJobs.userEquipmentId,
      completeAt: enhancementJobs.completeAt,
      startedAt: enhancementJobs.startedAt,
      enhanceLevel: userEquipment.enhanceLevel,
      transcendLevel: userEquipment.transcendLevel,
      code: catalogItems.code,
      name: catalogItems.name,
      slot: catalogItems.slot,
    })
    .from(enhancementJobs)
    .innerJoin(userEquipment, eq(userEquipment.id, enhancementJobs.userEquipmentId))
    .innerJoin(catalogItems, eq(catalogItems.id, userEquipment.catalogItemId))
    .where(
      and(
        eq(enhancementJobs.userId, userId),
        eq(enhancementJobs.serverId, await getActiveServerId()),
        eq(enhancementJobs.status, 'running'),
        eq(catalogItems.slot, slot),
      ),
    );
  return {
    status: 'success' as const,
    jobs: rows.map((r) => ({
      jobId: r.jobId.toString(),
      userEquipmentId: r.userEquipmentId.toString(),
      completeAtIso: r.completeAt.toISOString(),
      startedAtIso: r.startedAt.toISOString(),
      enhanceLevel: r.enhanceLevel,
      transcendLevel: r.transcendLevel,
      code: r.code,
      name: r.name,
      slot: r.slot,
    })),
  };
  } catch (e) {
    // 유일하게 서버측 catch가 없던 조회 액션 — throw가 클라(SwapPickerModal)까지
    // 전파되면 "불러오는 중…" 무한 로딩으로 굳는다.
    console.error('[enhance.getActiveJobsForSlot]', e);
    return err('UNKNOWN');
  }
}

/** (D+A) 슬롯 교체 — 취소 + 등록 단일 트랜잭션 */
export async function swapEnhanceAction(cancelJobId: string, userEquipmentId: string) {
  const userId = await uid();
  if (!userId) return err('UNAUTHENTICATED');
  if (await rateLimited(userId, 'enhance')) return err('RATE_LIMITED');
  const __b = await actionBlock(); if (__b) return err(__b);
  try {
    const cid = toJobId(cancelJobId);
    if (cid == null) return err('JOB_NOT_FOUND');
    const result = await swapEnhance({
      userId,
      cancelJobId: cid,
      userEquipmentId: BigInt(userEquipmentId),
    });
    revalidateAll();
    return { status: 'success' as const, jobId: result.jobId.toString() };
  } catch (e) {
    if (e instanceof EnhanceError) return err(e.code);
    console.error('[enhance.swap]', e);
    return err('UNKNOWN');
  }
}
