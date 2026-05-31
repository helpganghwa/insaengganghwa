'use server';

import { revalidatePath } from 'next/cache';
import { eq, sql } from 'drizzle-orm';
import { unstable_cache } from 'next/cache';

import { getSessionUserId } from '@/lib/auth/session';
import { db } from '@/lib/db/client';
import { enhancementJobs } from '@/lib/db/schema/enhance';
import { NICKNAME_CHANGE_COST_DIAMOND } from '@/lib/game/balance';
import { validateNickname } from '@/lib/game/nickname';
import { rateLimited } from '@/lib/ratelimit';

export interface NicknameChangeOk {
  status: 'success';
  changedCount: number;
  diamondLeft: string;
  charged: number;
}
export interface NicknameChangeErr {
  status: 'error';
  code: 'INVALID' | 'TAKEN' | 'INSUFFICIENT_DIAMOND' | 'RATE_LIMIT' | 'UNAUTH';
  message: string;
}

/**
 * 닉네임 변경 — **첫 변경 무료, 이후 매번 1000 다이아 차감**.
 *  - 단일 SQL CTE: 닉네임 중복 체크 → 다이아·count 조건부 차감/증가 → nickname update
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
  const next = String(raw ?? '').trim();
  const v = validateNickname(next);
  if (!v.ok) {
    return { status: 'error', code: 'INVALID', message: v.reason };
  }

  try {
    // 단일 트랜잭션 — 첫 변경(count=0)이면 free, 아니면 1000 차감.
    // RETURNING으로 결과 산출. 다이아 부족 또는 닉네임 중복 시 row 0 → 에러.
    const rows = (await db.execute(sql`
      with curr as (
        select id, diamond, nickname_changed_count as cnt
        from profiles where id = ${userId}::uuid for update
      ),
      cost as (
        select case when cnt = 0 then 0 else ${NICKNAME_CHANGE_COST_DIAMOND} end as c
        from curr
      ),
      upd as (
        update profiles p
        set nickname = ${next},
            nickname_changed_count = p.nickname_changed_count + 1,
            diamond = p.diamond - (select c from cost),
            updated_at = now()
        from curr, cost
        where p.id = curr.id
          and curr.diamond >= cost.c
        returning p.nickname_changed_count as cnt, p.diamond, cost.c as charged
      )
      select cnt, diamond::text as diamond, charged from upd
    `)) as unknown as { cnt: number; diamond: string; charged: number }[];

    if (rows.length === 0) {
      // 다이아 부족
      return {
        status: 'error',
        code: 'INSUFFICIENT_DIAMOND',
        message: `다이아가 부족합니다 (필요 ${NICKNAME_CHANGE_COST_DIAMOND.toLocaleString('ko-KR')})`,
      };
    }
    revalidatePath('/me');
    revalidatePath('/me/settings');
    const r = rows[0]!;
    return {
      status: 'success',
      changedCount: r.cnt,
      diamondLeft: r.diamond,
      charged: r.charged,
    };
  } catch (e) {
    // UNIQUE 위반 — 닉네임 중복
    if (e instanceof Error && /nickname/i.test(e.message)) {
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
 * 현재 강화 진행 중인 distinct 사용자 수 — 카카오 공유 description("N명이 인생 강화중") 용.
 * 60s unstable_cache로 부하 낮춤(공유 모달 매 오픈마다 fresh fetch 회피).
 */
const cachedEnhancingUsers = unstable_cache(
  async () => {
    const r = await db
      .select({ c: sql<number>`count(distinct ${enhancementJobs.userId})::int` })
      .from(enhancementJobs)
      .where(eq(enhancementJobs.status, 'running'));
    return Number(r[0]?.c ?? 0);
  },
  ['boast:enhancing-users'],
  { revalidate: 60, tags: ['leaderboard'] },
);

export async function getEnhancingUserCount(): Promise<number> {
  return cachedEnhancingUsers();
}
