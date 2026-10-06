import 'server-only';

import { and, eq, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { characters } from '@/lib/db/schema/server';
import { PROFILE_BASE_SLOTS, PROFILE_MAX, PROFILE_SLOT_COST_DIAMOND, PROFILE_SLOT_STEP, profileSlotLimit } from '@/lib/game/balance';
import { walletTrySpend } from '@/lib/game/wallet';

export class AvatarSlotError extends Error {
  constructor(public code: 'SLOT_MAX' | 'INSUFFICIENT_DIAMOND' | 'NO_CHARACTER') {
    super(code);
  }
}

/** 지금 보관 한도(서버별). 캐릭터가 없으면 기본 칸. */
export async function avatarSlotLimit(userId: string, serverId: number): Promise<number> {
  const [r] = await db
    .select({ bonus: characters.avatarSlotBonus })
    .from(characters)
    .where(and(eq(characters.userId, userId), eq(characters.serverId, serverId)))
    .limit(1);
  return profileSlotLimit(r?.bonus ?? 0);
}

/**
 * 아바타 보관함 늘리기(2026-10-06) — 💎1,000에 10칸, 최대 PROFILE_MAX칸. 서버별.
 * 칸 증가(상한 조건부 UPDATE)와 다이아 차감(조건부)을 한 트랜잭션에서 — 어느 쪽이든 실패하면 통째로 되돌린다.
 * 조건부 UPDATE가 행을 잠그므로 연타·동시 요청도 상한을 넘지 못한다.
 */
export async function expandAvatarSlots(userId: string, serverId: number): Promise<{ limit: number }> {
  return db.transaction(async (tx) => {
    const rows = await tx
      .update(characters)
      .set({ avatarSlotBonus: sql`${characters.avatarSlotBonus} + ${PROFILE_SLOT_STEP}` })
      .where(
        and(
          eq(characters.userId, userId),
          eq(characters.serverId, serverId),
          sql`${PROFILE_BASE_SLOTS} + ${characters.avatarSlotBonus} + ${PROFILE_SLOT_STEP} <= ${PROFILE_MAX}`,
        ),
      )
      .returning({ bonus: characters.avatarSlotBonus });
    if (rows.length === 0) {
      const [c] = await tx
        .select({ bonus: characters.avatarSlotBonus })
        .from(characters)
        .where(and(eq(characters.userId, userId), eq(characters.serverId, serverId)));
      throw new AvatarSlotError(c ? 'SLOT_MAX' : 'NO_CHARACTER');
    }
    const paid = await walletTrySpend(tx, userId, serverId, PROFILE_SLOT_COST_DIAMOND, 'avatar_slot');
    if (!paid) throw new AvatarSlotError('INSUFFICIENT_DIAMOND');
    return { limit: profileSlotLimit(rows[0]!.bonus) };
  });
}
