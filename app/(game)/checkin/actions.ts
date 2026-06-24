'use server';

import { revalidatePath } from 'next/cache';

import { getSessionUserId } from '@/lib/auth/session';
import { rateLimited } from '@/lib/ratelimit';
import { getMaintenanceState } from '@/lib/game/system-mode';
import { claimCheckin, CheckinError, type CheckinClaimResult } from '@/lib/game/checkin';
import { getActiveServerId } from '@/lib/game/servers';

type ErrorState = { status: 'error'; code: string; message: string };

const MSG: Record<string, string> = {
  CHECKIN_ALREADY_CLAIMED: '오늘은 이미 출석을 수령했습니다.',
  UNAUTHENTICATED: '로그인이 필요합니다.',
  RATE_LIMITED: '요청이 너무 빠릅니다. 잠시 후 다시 시도해 주세요.',
  MAINTENANCE: '서버 점검 중입니다. 잠시 후 다시 시도해 주세요.',
  UNKNOWN: '알 수 없는 오류',
};

function err(code: string): ErrorState {
  return { status: 'error', code, message: MSG[code] ?? code };
}

export async function claimCheckinAction(): Promise<
  { status: 'success'; result: CheckinClaimResult } | ErrorState
> {
  const userId = await getSessionUserId();
  if (!userId) return err('UNAUTHENTICATED');
  if (await rateLimited(userId, 'checkin')) return err('RATE_LIMITED');
  if ((await getMaintenanceState()).active) return err('MAINTENANCE');
  try {
    const result = await claimCheckin({ userId, serverId: await getActiveServerId() });
    revalidatePath('/checkin');
    revalidatePath('/'); // 홈 진입 카드
    return { status: 'success', result };
  } catch (e) {
    if (e instanceof CheckinError) return err(e.code);
    console.error('[checkin.claim]', e);
    return err('UNKNOWN');
  }
}
