'use server';

import { revalidatePath } from 'next/cache';
import { after } from 'next/server';

import { getSessionUserId } from '@/lib/auth/session';
import { rateLimited } from '@/lib/ratelimit';
import { actionBlock } from '@/lib/game/action-gate';
import { createProfileJob } from '@/lib/game/profile/actions';
import { drainQueue } from '@/lib/game/profile/pipeline-v3';
import { CreateProfileJobError } from '@/lib/game/profile/errors';

/**
 * PROFILE §8.3 — 프로필 생성 화면용 Server Action.
 * createProfileJob(throw 방식)을 래핑해 클라이언트가 다룰 수 있는 ErrorState로 변환.
 * 유저 입력은 gender만 — 표정·머리길이·종족·머리색은 서버 random·장비 모티프가 결정.
 */
type CreateState =
  | { status: 'ok'; jobId: string; estimatedMinutes: number }
  | { status: 'error'; code: string; message: string };

const MSG: Record<string, string> = {
  UNAUTHORIZED: '로그인이 필요합니다.',
  INVALID_OPTIONS: '옵션이 유효하지 않습니다.',
  BANNED: '이용이 제한된 계정입니다.',
  MAINTENANCE: '서버 점검 중입니다. 잠시 후 다시 시도해 주세요.',
  NO_EQUIPMENT: '무기·방어구·장신구 3종을 모두 장착해야 합니다.',
  INSUFFICIENT_DIAMOND: '다이아가 부족합니다.',
  PROFILE_GEN_IN_PROGRESS: '이미 아바타를 생성하고 있어요. 완료 후 다시 시도해 주세요.',
  PROFILE_LIMIT: '아바타 보관함이 가득 찼습니다. 아바타 선택 화면에서 보관함을 확장하거나 사용하지 않는 아바타를 삭제해 주세요.',
  RATE_LIMITED: '아바타 생성이 너무 잦습니다. 잠시 후 다시 시도해 주세요.',
  UNKNOWN: '알 수 없는 오류가 발생했습니다.',
};

export async function submitProfileJob(
  gender: 'male' | 'female',
): Promise<CreateState> {
  // 고비용 생성(Claude compose + Pixellab + 비전 리뷰) — 실패-환불 재시도 루프 방어(시간당 5건).
  const userId = await getSessionUserId();
  if (!userId) return { status: 'error', code: 'UNAUTHORIZED', message: MSG.UNAUTHORIZED! };
  if (await rateLimited(userId, 'profile'))
    return { status: 'error', code: 'RATE_LIMITED', message: MSG.RATE_LIMITED! };
  const blocked = await actionBlock();
  if (blocked) return { status: 'error', code: blocked, message: MSG[blocked] ?? MSG.UNKNOWN! };
  try {
    const r = await createProfileJob({ gender });
    // 즉시 시작 — 응답 후 백그라운드로 드레인(여유 슬롯 있으면 2분 cron 안 기다리고 바로 발주).
    // best-effort: 실패해도 cron 백스톱이 다음 tick에 픽업. 슬롯 가득이면 queued 유지(대기열).
    after(async () => {
      try {
        await drainQueue();
      } catch (e) {
        console.error('[profile.submit.drain]', e);
      }
    });
    revalidatePath('/me');
    revalidatePath('/me/create');
    return { status: 'ok', jobId: r.jobId, estimatedMinutes: r.estimatedMinutes };
  } catch (e) {
    if (e instanceof CreateProfileJobError) {
      return { status: 'error', code: e.code, message: MSG[e.code] ?? MSG.UNKNOWN! };
    }
    return { status: 'error', code: 'UNKNOWN', message: MSG.UNKNOWN! };
  }
}
