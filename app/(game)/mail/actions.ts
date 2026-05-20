'use server';

import { revalidatePath } from 'next/cache';

import { getSessionUserId } from '@/lib/auth/session';
import { rateLimited } from '@/lib/ratelimit';
import {
  claimMail,
  claimAllMail,
  MailError,
  type ClaimResult,
} from '@/lib/game/mailbox';

type ErrorState = { status: 'error'; code: string; message: string };

const MSG: Record<string, string> = {
  MAIL_NOT_FOUND: '이미 수령했거나 만료된 우편입니다.',
  UNAUTHENTICATED: '로그인이 필요합니다.',
  RATE_LIMITED: '요청이 너무 빠릅니다. 잠시 후 다시 시도해 주세요.',
  UNKNOWN: '알 수 없는 오류',
};

function err(code: string): ErrorState {
  return { status: 'error', code, message: MSG[code] ?? code };
}

function revalidate() {
  revalidatePath('/mail');
  revalidatePath('/'); // 헤더 배지 카운트
}

async function uid(): Promise<string | null> {
  return getSessionUserId();
}

export async function claimMailAction(
  mailId: string,
): Promise<{ status: 'success'; result: ClaimResult } | ErrorState> {
  const userId = await uid();
  if (!userId) return err('UNAUTHENTICATED');
  if (await rateLimited(userId, 'mail')) return err('RATE_LIMITED');
  try {
    const result = await claimMail({ userId, mailId: BigInt(mailId) });
    revalidate();
    return { status: 'success', result };
  } catch (e) {
    if (e instanceof MailError) return err(e.code);
    console.error('[mail.claim]', e);
    return err('UNKNOWN');
  }
}

export async function claimAllMailAction(): Promise<
  { status: 'success'; result: ClaimResult } | ErrorState
> {
  const userId = await uid();
  if (!userId) return err('UNAUTHENTICATED');
  if (await rateLimited(userId, 'mail')) return err('RATE_LIMITED');
  try {
    const result = await claimAllMail({ userId });
    revalidate();
    return { status: 'success', result };
  } catch (e) {
    if (e instanceof MailError) return err(e.code);
    console.error('[mail.claimAll]', e);
    return err('UNKNOWN');
  }
}
