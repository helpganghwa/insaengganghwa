import 'server-only';

import { and, eq, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { characters } from '@/lib/db/schema/server';
import { PROFILE_BASE_SLOTS, PROFILE_MAX, PROFILE_SLOT_STEP, profileSlotCost, profileSlotLimit } from '@/lib/game/balance';
import { getWalletDiamond, walletTrySpend } from '@/lib/game/wallet';

export class AvatarSlotError extends Error {
  constructor(public code: 'SLOT_MAX' | 'INSUFFICIENT_DIAMOND' | 'NO_CHARACTER' | 'BAD_REQUEST') {
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
 * 아바타 보관함 늘리기(2026-10-06, 10-16 상한 300·구간 가격) — 10칸에 💎1,000, 200칸부터는 💎1,500(profileSlotCost — 잠근 행의 **지금 한도** 기준), 최대 PROFILE_MAX칸. 서버별.
 * 칸 증가(상한 조건부 UPDATE)와 다이아 차감(조건부)을 한 트랜잭션에서 — 어느 쪽이든 실패하면 통째로 되돌린다.
 * 조건부 UPDATE가 행을 잠그므로 연타·동시 요청도 상한을 넘지 못한다.
 */
export async function expandAvatarSlots(
  userId: string,
  serverId: number,
  key: string,
): Promise<{ limit: number; duplicate: boolean; diamondBalance: string }> {
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(key)) throw new AvatarSlotError('BAD_REQUEST');
  const ref = `slot:${userId}:${key}`;
  return db.transaction(async (tx) => {
    // 캐릭터 행을 먼저 잠근다 — 같은 키 재전송이 동시에 와도 앞 요청이 커밋한 뒤에 아래 확인을 하게.
    const [locked] = await tx
      .select({ bonus: characters.avatarSlotBonus })
      .from(characters)
      .where(and(eq(characters.userId, userId), eq(characters.serverId, serverId)))
      .for('update');
    if (!locked) throw new AvatarSlotError('NO_CHARACTER');
    // 같은 요청 키(응답 유실 뒤 재전송)는 이미 산 것 — 두 번 결제하지 않는다(CLAUDE §3.4).
    const [prev] = (await tx.execute(sql`select 1 from diamond_ledger where user_id = ${userId}::uuid and reason = 'avatar_slot' and ref = ${ref} limit 1`)) as unknown as unknown[];
    // 잔액을 함께 돌려준다 — 재전송 판정이어도 화면의 💎가 서버 값에 정확히 맞게.
    if (prev) return { limit: profileSlotLimit(locked.bonus), duplicate: true, diamondBalance: (await getWalletDiamond(tx, userId, serverId)).toString() };
    // 가격은 늘리기 **전** 한도로 정한다 — 190→200은 1,000, 200→210부터 1,500.
    const cost = profileSlotCost(profileSlotLimit(locked.bonus));
    const rows = await tx
      .update(characters)
      // 10칸씩 늘리되 최대 300칸까지만 — 10의 배수가 아닌 값이 있어도 마지막 구매에서 300에 맞춘다(prod 10-16 실측: 0 또는 100뿐).
      .set({ avatarSlotBonus: sql`least(${characters.avatarSlotBonus} + ${PROFILE_SLOT_STEP}, ${PROFILE_MAX - PROFILE_BASE_SLOTS})` })
      .where(
        and(
          eq(characters.userId, userId),
          eq(characters.serverId, serverId),
          sql`${PROFILE_BASE_SLOTS} + ${characters.avatarSlotBonus} < ${PROFILE_MAX}`,
        ),
      )
      .returning({ bonus: characters.avatarSlotBonus });
    if (rows.length === 0) throw new AvatarSlotError('SLOT_MAX');
    const paid = await walletTrySpend(tx, userId, serverId, cost, 'avatar_slot', ref);
    if (!paid) throw new AvatarSlotError('INSUFFICIENT_DIAMOND');
    return { limit: profileSlotLimit(rows[0]!.bonus), duplicate: false, diamondBalance: (await getWalletDiamond(tx, userId, serverId)).toString() };
  });
}
