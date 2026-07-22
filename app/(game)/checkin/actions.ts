'use server';

import { getSessionUserId } from '@/lib/auth/session';
import { makeErr, type ErrorResult } from '@/lib/game/action-result';
import { rateLimited } from '@/lib/ratelimit';
import { actionBlock } from '@/lib/game/action-gate';
import { claimCheckin, CheckinError, type CheckinClaimResult } from '@/lib/game/checkin';
import { getActiveServerId } from '@/lib/game/servers';

type ErrorState = ErrorResult;

const MSG: Record<string, string> = {
  CHECKIN_ALREADY_CLAIMED: '오늘은 이미 출석을 수령했습니다.',
  UNAUTHENTICATED: '로그인이 필요합니다.',
  RATE_LIMITED: '요청이 너무 빠릅니다. 잠시 후 다시 시도해 주세요.',
  MAINTENANCE: '서버 점검 중입니다. 잠시 후 다시 시도해 주세요.',
  BANNED: '이용이 제한된 계정입니다.',
  // claim 내부 불변식 위반(upsert 직후 행 부재) — 발생 시 코드 원문 대신 재시도 안내.
  CHECKIN_STATE_MISSING: '일시적인 오류가 발생했어요. 잠시 후 다시 시도해 주세요.',
  UNKNOWN: '알 수 없는 오류',
};

const err = makeErr(MSG);

export async function claimCheckinAction(): Promise<
  { status: 'success'; result: CheckinClaimResult } | ErrorState
> {
  const userId = await getSessionUserId();
  if (!userId) return err('UNAUTHENTICATED');
  if (await rateLimited(userId, 'checkin')) return err('RATE_LIMITED');
  const __b = await actionBlock(); if (__b) return err(__b);
  try {
    const result = await claimCheckin({ userId, serverId: await getActiveServerId() });
    // revalidatePath 없음(의도) — 액션 응답의 자동 RSC 갱신이 팝업 게이트(unclaimed)를 즉시
    // 뒤집어 수령 연출(이펙트→게이지→토스트)이 도중에 언마운트됐다(2026-07-22 E2E).
    // 갱신은 연출 종료 후 팝업이 router.refresh()로 직접 수행.
    return { status: 'success', result };
  } catch (e) {
    if (e instanceof CheckinError) return err(e.code);
    console.error('[checkin.claim]', e);
    return err('UNKNOWN');
  }
}
