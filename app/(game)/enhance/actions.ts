'use server';

import { revalidatePath } from 'next/cache';
import { and, eq, sql } from 'drizzle-orm';

import { getSessionUserId } from '@/lib/auth/session';
import { rateLimited } from '@/lib/ratelimit';
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

type ErrorState = { status: 'error'; code: string; message: string };

const MSG: Record<string, string> = {
  EQUIPMENT_NOT_FOUND: '장비를 찾을 수 없습니다.',
  ALREADY_ENHANCING: '이미 강화 중인 장비입니다.',
  SLOT_BUSY: '같은 부위 2 lane이 모두 사용 중입니다.',
  JOB_NOT_FOUND: '강화 작업을 찾을 수 없습니다.',
  INSUFFICIENT_DIAMOND: '다이아가 부족합니다.',
  UNAUTHENTICATED: '로그인이 필요합니다.',
  RATE_LIMITED: '요청이 너무 빠릅니다. 잠시 후 다시 시도해 주세요.',
  UNKNOWN: '알 수 없는 오류',
};

function err(code: string): ErrorState {
  return { status: 'error', code, message: MSG[code] ?? code };
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
 * (B) 강화 시도 — 유저 조기 시도 허용(effective rate). 성공 시 서버 자동 재등록.
 * 토스트용 ranks before/after 동봉(상승/하락 모두 표시, 클라이언트가 디바운스/노출 판단).
 */
export async function finalizeEnhance(jobId: string): Promise<
  | {
      status: 'success';
      result: Omit<ResolveResult, 'jobId' | 'userEquipmentId'>;
      requeued: boolean;
      ranksBefore: MyRanks;
      ranksAfter: MyRanks;
    }
  | ErrorState
> {
  const userId = await uid();
  if (!userId) return err('UNAUTHENTICATED');
  if (await rateLimited(userId, 'enhance')) return err('RATE_LIMITED');
  try {
    // 강화 직전 — 캐시 시점 본인 3 메트릭 + 순위(토스트 before).
    const ranksBefore = await getMyRanks(userId);

    // 결과 판정·저장 원자 트랜잭션(CLAUDE §3.1/§3.3/§3.4).
    const r = await resolveEnhance({ jobId: BigInt(jobId), userId, requireComplete: false });

    // 결과 무관 자동 재등록(GDD §3.2 갱신 — 실패도 슬롯 유지) — **응답 내에서
    // await** 해야 함. 백그라운드(after)로 빼면 응답 후 router.refresh가 새 잡
    // 생성 전에 /enhance를 재렌더해 슬롯이 빈 상태로 깜빡임(레이스, 검증됨).
    // best-effort·멱등 — MAX 레벨 도달 등으로 큐잉 실패는 흡수(슬롯 자연 해제).
    let requeued = false;
    try {
      await queueEnhance({ userId, userEquipmentId: r.userEquipmentId });
      requeued = true;
    } catch (re) {
      if (!(re instanceof EnhanceError)) console.error('[enhance.requeue]', re);
    }
    // 강화 직후 — 본인 새 stat 직접 fetch + 캐시 sorted bisect(토스트 after).
    const ranksAfter = await getMyRanksAfter(userId);
    // 묶음 알림에서 이미 처리된 잡 제거 — best-effort. 다음 cron이 빈 묶음 발송 안 함.
    await cleanupPushPendingJob(userId, jobId);
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
      ranksBefore,
      ranksAfter,
    };
  } catch (e) {
    if (e instanceof EnhanceError) return err(e.code);
    console.error('[enhance.resolve]', e);
    return err('UNKNOWN');
  }
}

/** (C) 보석 단축 */
export async function reduceTimeWithGems(jobId: string, diamonds: number) {
  const userId = await uid();
  if (!userId) return err('UNAUTHENTICATED');
  if (await rateLimited(userId, 'enhance')) return err('RATE_LIMITED');
  try {
    const serverId = await getActiveServerId();
    const result = await reduceEnhanceTime({ userId, serverId, jobId: BigInt(jobId), diamonds });
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
  if (await rateLimited(userId, 'enhance')) return err('RATE_LIMITED');
  try {
    await cancelEnhance({ userId, jobId: BigInt(jobId) });
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
  const rows = await db
    .select({
      jobId: enhancementJobs.id,
      userEquipmentId: enhancementJobs.userEquipmentId,
      completeAt: enhancementJobs.completeAt,
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
      enhanceLevel: r.enhanceLevel,
      transcendLevel: r.transcendLevel,
      code: r.code,
      name: r.name,
      slot: r.slot,
    })),
  };
}

/** (D+A) 슬롯 교체 — 취소 + 등록 단일 트랜잭션 */
export async function swapEnhanceAction(cancelJobId: string, userEquipmentId: string) {
  const userId = await uid();
  if (!userId) return err('UNAUTHENTICATED');
  if (await rateLimited(userId, 'enhance')) return err('RATE_LIMITED');
  try {
    const result = await swapEnhance({
      userId,
      cancelJobId: BigInt(cancelJobId),
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
