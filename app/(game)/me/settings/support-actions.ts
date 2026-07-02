'use server';

import { getSessionUserId } from '@/lib/auth/session';
import { getActiveServerId } from '@/lib/game/servers';
import { rateLimited } from '@/lib/ratelimit';
import { submitInquiry } from '@/lib/game/support/inquiry';
import { INQUIRY_IDS, BODY_MIN, BODY_MAX, type InquiryType } from '@/lib/game/support/types';

type Result = { status: 'success' } | { status: 'error'; message: string };

/** 고객센터 문의 접수 — 인증·유형·길이 검증 + 레이트리밋 후 저장(+접수 안내 우편). */
export async function submitInquiryAction(type: string, body: string): Promise<Result> {
  const userId = await getSessionUserId();
  if (!userId) return { status: 'error', message: '로그인이 필요합니다.' };
  if (!INQUIRY_IDS.has(type)) return { status: 'error', message: '문의 유형을 선택해 주세요.' };
  const trimmed = (body ?? '').trim();
  if (trimmed.length < BODY_MIN)
    return { status: 'error', message: `문의 내용을 ${BODY_MIN}자 이상 적어주세요.` };
  if (trimmed.length > BODY_MAX)
    return { status: 'error', message: `문의 내용은 ${BODY_MAX}자 이내로 적어주세요.` };
  if (await rateLimited(userId, 'support'))
    return { status: 'error', message: '잠시 후 다시 시도해 주세요.' };

  try {
    const serverId = await getActiveServerId();
    await submitInquiry({ userId, serverId, type: type as InquiryType, body: trimmed });
    return { status: 'success' };
  } catch (e) {
    console.error('[support] submit failed', (e as Error).message);
    return { status: 'error', message: '접수 중 오류가 발생했어요. 잠시 후 다시 시도해 주세요.' };
  }
}
