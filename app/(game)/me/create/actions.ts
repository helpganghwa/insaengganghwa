'use server';

import { revalidatePath } from 'next/cache';

import { createProfileJob } from '@/lib/game/profile/actions';
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
  NO_EQUIPMENT: '무기·방어구·장신구 3종을 모두 장착해야 합니다.',
  INSUFFICIENT_DIAMOND: '다이아가 부족합니다.',
  PROFILE_GEN_IN_PROGRESS: '이미 프로필을 생성하고 있어요. 완료 후 다시 시도해 주세요.',
  PROFILE_LIMIT: '프로필은 최대 20개까지 보유할 수 있습니다.',
  UNKNOWN: '알 수 없는 오류가 발생했습니다.',
};

export async function submitProfileJob(
  gender: 'male' | 'female',
): Promise<CreateState> {
  try {
    const r = await createProfileJob({ gender });
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
