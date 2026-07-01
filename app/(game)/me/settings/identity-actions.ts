'use server';

import { revalidatePath } from 'next/cache';

import { getSessionUserId } from '@/lib/auth/session';
import { verifyAndStoreIdentity } from '@/lib/payment/identity';

/**
 * 본인인증 완료 처리 — 클라가 requestIdentityVerification 후 identityVerificationId를 넘기면
 * 서버가 포트원 재조회로 검증·저장한다. 성공 시 성년 여부 반환(미성년은 결제 한도 적용).
 */
export async function verifyIdentityAction(
  identityVerificationId: string,
): Promise<{ ok: true; isAdult: boolean } | { ok: false; message: string }> {
  const userId = await getSessionUserId();
  if (!userId) return { ok: false, message: '로그인이 필요합니다.' };
  if (!identityVerificationId) return { ok: false, message: '본인인증 정보가 없습니다.' };

  const r = await verifyAndStoreIdentity(userId, identityVerificationId);
  if (!r.ok) return { ok: false, message: r.message };
  revalidatePath('/me/settings');
  return { ok: true, isAdult: r.isAdult };
}
