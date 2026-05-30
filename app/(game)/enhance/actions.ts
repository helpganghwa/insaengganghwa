'use server';

import { revalidatePath } from 'next/cache';

import { getSessionUserId } from '@/lib/auth/session';
import { rateLimited } from '@/lib/ratelimit';
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

type ErrorState = { status: 'error'; code: string; message: string };

const MSG: Record<string, string> = {
  EQUIPMENT_NOT_FOUND: '장비를 찾을 수 없습니다.',
  EQUIPMENT_LOCKED: '잠긴 장비는 강화할 수 없습니다.',
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

/** (A) 큐 등록 — 강화 무료. (경고 동의 없음, §2 치환표) */
export async function startEnhance(equipmentInstanceId: string) {
  const userId = await uid();
  if (!userId) return err('UNAUTHENTICATED');
  if (await rateLimited(userId, 'enhance')) return err('RATE_LIMITED');
  try {
    const result = await queueEnhance({ userId, equipmentInstanceId: BigInt(equipmentInstanceId) });
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
      result: Omit<ResolveResult, 'jobId' | 'equipmentInstanceId'>;
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
      await queueEnhance({ userId, equipmentInstanceId: r.equipmentInstanceId });
      requeued = true;
    } catch (re) {
      if (!(re instanceof EnhanceError)) console.error('[enhance.requeue]', re);
    }
    // 강화 직후 — 본인 새 stat 직접 fetch + 캐시 sorted bisect(토스트 after).
    const ranksAfter = await getMyRanksAfter(userId);
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
    const result = await reduceEnhanceTime({ userId, jobId: BigInt(jobId), diamonds });
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

/** (D+A) 슬롯 교체 — 취소 + 등록 단일 트랜잭션 */
export async function swapEnhanceAction(cancelJobId: string, equipmentInstanceId: string) {
  const userId = await uid();
  if (!userId) return err('UNAUTHENTICATED');
  if (await rateLimited(userId, 'enhance')) return err('RATE_LIMITED');
  try {
    const result = await swapEnhance({
      userId,
      cancelJobId: BigInt(cancelJobId),
      equipmentInstanceId: BigInt(equipmentInstanceId),
    });
    revalidateAll();
    return { status: 'success' as const, jobId: result.jobId.toString() };
  } catch (e) {
    if (e instanceof EnhanceError) return err(e.code);
    console.error('[enhance.swap]', e);
    return err('UNKNOWN');
  }
}
