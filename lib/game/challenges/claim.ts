import 'server-only';

import { sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { challengeClaims } from '@/lib/db/schema/challenges';
import { walletAdd } from '@/lib/game/wallet';

import { COMPLETE_BONUS, activeChallenges } from './defs';
import { doneCondSql } from './status';

/**
 * 과제 수령 — 단일 트랜잭션: 달성 재검증(서버 권위, status와 동일 조건 SQL) →
 * claims insert(PK 멱등, 이미 수령이면 no-op) → 지급(walletAdd / 완료 보너스는 상자 포함).
 */
export async function claimChallenge(
  userId: string,
  serverId: number,
  challengeId: string,
  hidePaid: boolean,
): Promise<
  | { ok: true; diamond: number; boxes: { weapon: number; armor: number; accessory: number } | null }
  | { ok: false; reason: 'UNKNOWN_ID' | 'NOT_DONE' | 'ALREADY' }
> {
  // ── 전체 완료 보너스 ──
  if (challengeId === COMPLETE_BONUS.id) {
    return db.transaction(async (tx) => {
      const [r] = (await tx.execute(sql`
        select (select count(*)::int from challenge_claims
                 where user_id=${userId}::uuid and server_id=${serverId}
                   and challenge_id <> ${COMPLETE_BONUS.id}) as n
      `)) as unknown as { n: number }[];
      if ((r?.n ?? 0) < activeChallenges(hidePaid).length)
        return { ok: false as const, reason: 'NOT_DONE' as const };
      const ins = await tx
        .insert(challengeClaims)
        .values({
          userId,
          serverId,
          challengeId: COMPLETE_BONUS.id,
          diamond: BigInt(COMPLETE_BONUS.diamond),
          boxes: COMPLETE_BONUS.boxes,
        })
        .onConflictDoNothing()
        .returning({ id: challengeClaims.challengeId });
      if (ins.length === 0) return { ok: false as const, reason: 'ALREADY' as const };
      await walletAdd(tx, userId, serverId, COMPLETE_BONUS.diamond);
      // 보급상자 지급 — 슬롯별 upsert(가입 보너스와 동일 계열).
      for (const [slot, n] of Object.entries(COMPLETE_BONUS.boxes)) {
        await tx.execute(sql`
          insert into user_supply_boxes (user_id, server_id, slot, count)
          values (${userId}::uuid, ${serverId}, ${slot}, ${n})
          on conflict (user_id, server_id, slot) do update set count = user_supply_boxes.count + ${n}
        `);
      }
      return { ok: true as const, diamond: COMPLETE_BONUS.diamond, boxes: COMPLETE_BONUS.boxes };
    });
  }

  // ── 일반 과제 ──
  const def = activeChallenges(hidePaid).find((c) => c.id === challengeId);
  if (!def) return { ok: false, reason: 'UNKNOWN_ID' };

  return db.transaction(async (tx) => {
    const [r] = (await tx.execute(
      sql`select ${doneCondSql(def.id, userId, serverId)} as done`,
    )) as unknown as { done: boolean }[];
    if (!r?.done) return { ok: false as const, reason: 'NOT_DONE' as const };
    const ins = await tx
      .insert(challengeClaims)
      .values({ userId, serverId, challengeId: def.id, diamond: BigInt(def.diamond), boxes: {} })
      .onConflictDoNothing()
      .returning({ id: challengeClaims.challengeId });
    if (ins.length === 0) return { ok: false as const, reason: 'ALREADY' as const };
    await walletAdd(tx, userId, serverId, def.diamond);
    return { ok: true as const, diamond: def.diamond, boxes: null };
  });
}
