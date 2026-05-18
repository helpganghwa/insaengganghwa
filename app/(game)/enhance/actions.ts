'use server';

import { revalidatePath } from 'next/cache';

import { getSessionUserId } from '@/lib/auth/session';
import {
  queueEnhance,
  resolveEnhance,
  reduceEnhanceTime,
  cancelEnhance,
  swapEnhance,
  EnhanceError,
  type ResolveResult,
} from '@/lib/game/enhance';

type ErrorState = { status: 'error'; code: string; message: string };

const MSG: Record<string, string> = {
  EQUIPMENT_NOT_FOUND: '장비를 찾을 수 없습니다.',
  EQUIPMENT_LOCKED: '잠긴 장비는 강화할 수 없습니다.',
  ALREADY_ENHANCING: '이미 강화 중인 장비입니다.',
  SLOT_BUSY: '같은 부위 2 lane이 모두 사용 중입니다.',
  INSUFFICIENT_FODDER: '+100 강화는 같은 아이템 1개가 제물로 필요합니다.',
  JOB_NOT_FOUND: '강화 작업을 찾을 수 없습니다.',
  INSUFFICIENT_DIAMOND: '다이아가 부족합니다.',
  UNAUTHENTICATED: '로그인이 필요합니다.',
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

/** (B) 강화 시도 — 유저 조기 시도 허용(effective rate). 성공 시 서버 자동 재등록. */
export async function finalizeEnhance(jobId: string): Promise<
  | { status: 'success'; result: Omit<ResolveResult, 'jobId' | 'equipmentInstanceId'>; requeued: boolean }
  | ErrorState
> {
  const userId = await uid();
  if (!userId) return err('UNAUTHENTICATED');
  try {
    const r = await resolveEnhance({ jobId: BigInt(jobId), userId, requireComplete: false });
    // 자동 재등록 — 성공 시 다음 레벨 큐잉 (실패/하락 시 중단, GDD §3.2). best-effort.
    let requeued = false;
    if (r.outcome === 'success') {
      try {
        await queueEnhance({ userId, equipmentInstanceId: r.equipmentInstanceId });
        requeued = true;
      } catch (re) {
        if (!(re instanceof EnhanceError)) console.error('[enhance.requeue]', re);
      }
    }
    revalidateAll();
    return {
      status: 'success',
      result: {
        outcome: r.outcome,
        fromLevel: r.fromLevel,
        toLevel: r.toLevel,
        effectiveRateBp: r.effectiveRateBp,
      },
      requeued,
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
