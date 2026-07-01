'use server';

import { revalidatePath } from 'next/cache';

import { getAdminStatus } from '@/lib/auth/require-admin';
import { answerInquiry } from '@/lib/game/support/inquiry';

/** 관리자 답변 — 우편 + 앱 푸시 발송. 이미 답변된 건은 no-op. */
export async function answerInquiryAction(
  inquiryId: string,
  answer: string,
): Promise<{ ok: boolean; msg?: string }> {
  const { userId, isAdmin } = await getAdminStatus();
  if (!isAdmin || !userId) return { ok: false, msg: '권한이 없습니다.' };
  const trimmed = (answer ?? '').trim();
  if (trimmed.length < 2) return { ok: false, msg: '답변 내용을 입력하세요.' };
  const r = await answerInquiry({ inquiryId: BigInt(inquiryId), adminUserId: userId, answer: trimmed });
  if (!r.ok) {
    return {
      ok: false,
      msg: r.reason === 'ALREADY_OR_NOT_FOUND' ? '이미 답변되었거나 없는 문의입니다.' : '답변 내용을 확인하세요.',
    };
  }
  revalidatePath('/admin/support');
  return { ok: true };
}
