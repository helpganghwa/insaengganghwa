'use server';

import { revalidatePath } from 'next/cache';
import { sql } from 'drizzle-orm';
import { unstable_cache } from 'next/cache';

import { getSessionUserId } from '@/lib/auth/session';
import { getActiveServerId } from '@/lib/game/servers';
import { db } from '@/lib/db/client';
import { isUniqueViolation } from '@/lib/db/errors';
import { applyNicknameChange } from '@/lib/game/nickname-change';
import { profiles } from '@/lib/db/schema/profiles';
import { NICKNAME_CHANGE_COST_DIAMOND } from '@/lib/game/balance';
import { validateNickname } from '@/lib/game/nickname';
import { containsProfanity } from '@/lib/game/moderation/profanity';
import { rateLimited } from '@/lib/ratelimit';
import { actionBlock } from '@/lib/game/action-gate';

export interface NicknameChangeOk {
  status: 'success';
  changedCount: number;
  diamondLeft: string;
  charged: number;
}
export interface NicknameChangeErr {
  status: 'error';
  code: 'INVALID' | 'TAKEN' | 'INSUFFICIENT_DIAMOND' | 'RATE_LIMIT' | 'UNAUTH' | 'MAINTENANCE' | 'BANNED';
  message: string;
}

/**
  * 닉네임 변경 — **첫 변경 무료, 이후 매번 NICKNAME_CHANGE_COST_DIAMOND 차감**.
 *  - 단일 트랜잭션: 행 잠금 → 비용 산정 → walletTrySpend(원장 기록) → nickname update
 *  - 비용은 호출 시점의 `nickname_changed_count`로 판정 (0이면 무료, ≥1이면 차감)
 *  - 동시 호출/race: UPDATE …WHERE diamond >= cost AND nickname unique 위반 시 트랜잭션 rollback
 */
export async function changeNicknameAction(
  raw: string,
): Promise<NicknameChangeOk | NicknameChangeErr> {
  const userId = await getSessionUserId();
  if (!userId) return { status: 'error', code: 'UNAUTH', message: '로그인이 필요합니다.' };
  if (await rateLimited(userId, 'nickname'))
    return { status: 'error', code: 'RATE_LIMIT', message: '요청이 너무 빠릅니다.' };
  const __b = await actionBlock();
  if (__b)
    return {
      status: 'error',
      code: __b,
      message: __b === 'BANNED' ? '이용이 제한된 계정입니다.' : '점검 중입니다. 잠시 후 다시 시도해 주세요.',
    };
  const serverId = await getActiveServerId();
  const next = String(raw ?? '').trim();
  const v = validateNickname(next);
  if (!v.ok) {
    return { status: 'error', code: 'INVALID', message: v.reason };
  }
  if (containsProfanity(next)) {
    return { status: 'error', code: 'INVALID', message: '사용할 수 없는 단어가 포함되어 있어요.' };
  }

  try {
    // 본문은 lib/game/nickname-change.ts — 세션 없이도 테스트가 같은 코드를 돌릴 수 있게 뺐다.
    const outcome = await db.transaction((tx) => applyNicknameChange(tx, userId, serverId, next));

    if (!outcome.ok && outcome.reason === 'INSUFFICIENT') {
      return {
        status: 'error',
        code: 'INSUFFICIENT_DIAMOND',
        message: `다이아가 부족합니다 (필요 ${NICKNAME_CHANGE_COST_DIAMOND.toLocaleString('ko-KR')})`,
      };
    }
    if (!outcome.ok) {
      return { status: 'error', code: 'INVALID', message: '변경에 실패했습니다.' };
    }
    revalidatePath('/me');
    revalidatePath('/me/settings');
    return {
      status: 'success',
      changedCount: outcome.changedCount,
      diamondLeft: outcome.diamondLeft,
      charged: outcome.charged,
    };
  } catch (e) {
    // UNIQUE 위반 — 닉네임 중복. 이 경로에서 23505를 낼 수 있는 제약은 characters_nickname_uq뿐이다.
    // (drizzle 0.45가 pg 에러를 감싸 e.code가 비므로 cause를 따라가는 헬퍼로 판정한다.)
    if (isUniqueViolation(e)) {
      return { status: 'error', code: 'TAKEN', message: '이미 사용 중인 닉네임입니다.' };
    }
    console.error('[changeNickname]', e);
    return { status: 'error', code: 'INVALID', message: '변경에 실패했습니다.' };
  }
}

/** @deprecated form action 형식. UI는 changeNicknameAction 사용 권장. 호환용 유지. */
export async function updateNickname(formData: FormData) {
  const next = String(formData.get('nickname') ?? '');
  const r = await changeNicknameAction(next);
  if (r.status === 'error') return { status: 'error' as const, message: r.message };
  return { status: 'success' as const };
}

/**
 * 전체 가입 유저 수 — 카카오 공유 description("N명이 인생 강화중") 용(텍스트는 유지, 숫자만 전체 유저).
 * 60s unstable_cache로 부하 낮춤(공유 모달 매 오픈마다 fresh fetch 회피).
 */
const cachedEnhancingUsers = unstable_cache(
  async () => {
    const r = await db.select({ c: sql<number>`count(*)::int` }).from(profiles);
    return Number(r[0]?.c ?? 0);
  },
  ['boast:total-users'],
  { revalidate: 60, tags: ['leaderboard'] },
);

export async function getEnhancingUserCount(): Promise<number> {
  return cachedEnhancingUsers();
}
