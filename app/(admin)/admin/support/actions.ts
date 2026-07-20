'use server';

import { revalidatePath } from 'next/cache';

import { safeBigInt } from '@/lib/util/id';

import { getAdminStatus } from '@/lib/auth/require-admin';
import { answerInquiry, deleteInquiry, type AnswerReward } from '@/lib/game/support/inquiry';

/** 관리자 답변 — 우편 + 앱 푸시 발송. 이미 답변된 건은 no-op. */
export async function answerInquiryAction(
  inquiryId: string,
  answer: string,
  reward?: AnswerReward,
): Promise<{ ok: boolean; msg?: string }> {
  const { userId, isAdmin } = await getAdminStatus();
  if (!isAdmin || !userId) return { ok: false, msg: '권한이 없습니다.' };
  const trimmed = (answer ?? '').trim();
  if (trimmed.length < 2) return { ok: false, msg: '답변 내용을 입력하세요.' };
  const iid = safeBigInt(inquiryId);
  if (iid === null) return { ok: false, msg: '잘못된 문의 ID입니다.' };
  const r = await answerInquiry({ inquiryId: iid, adminUserId: userId, answer: trimmed, reward: reward ?? null });
  if (!r.ok) {
    return {
      ok: false,
      msg: r.reason === 'ALREADY_OR_NOT_FOUND' ? '이미 답변되었거나 없는 문의입니다.' : '답변 내용을 확인하세요.',
    };
  }
  revalidatePath('/admin/support');
  return { ok: true };
}

/** 관리자 문의 삭제 — 답변 없이 종결(스팸·테스트·중복). 유저 통지 없음. */
export async function deleteInquiryAction(inquiryId: string): Promise<{ ok: boolean; msg?: string }> {
  const { userId, isAdmin } = await getAdminStatus();
  if (!isAdmin || !userId) return { ok: false, msg: '권한이 없습니다.' };
  const iid = safeBigInt(inquiryId);
  if (iid === null) return { ok: false, msg: '잘못된 문의 ID입니다.' };
  const ok = await deleteInquiry(iid);
  if (!ok) return { ok: false, msg: '이미 삭제되었거나 없는 문의입니다.' };
  revalidatePath('/admin/support');
  return { ok: true };
}
