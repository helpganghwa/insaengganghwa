'use server';

import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';

import { getSessionUserId } from '@/lib/auth/session';
import { rateLimited } from '@/lib/ratelimit';
import { actionBlock } from '@/lib/game/action-gate';
import { getActiveServerId } from '@/lib/game/servers';
import { db } from '@/lib/db/client';
import { runes } from '@/lib/db/schema/rune';
import { characters } from '@/lib/db/schema/server';
import { walletTrySpend } from '@/lib/game/wallet';
import { GEM_TO_MS, RUNE_SWAP_COOLDOWN_MS } from '@/lib/game/balance';

/**
 * 룬 장착/교체(0139 UI) — 캐릭터당 1개. 최초 장착 무쿨, 교체는 72h 쿨(잔여분 💎 단축
 * 1💎=1분 표준 — useGems 시 잔여 시간만큼 정산 후 즉시 교체). 서버 권위: 쿨·비용·소유권 전부 tx.
 */
export async function equipRuneAction(
  runeId: string,
  useGems = false,
): Promise<
  | { status: 'success'; gemsSpent: number }
  | { status: 'cooldown'; remainingMs: number; gemCost: number }
  | { status: 'error'; message: string }
> {
  const userId = await getSessionUserId();
  if (!userId) return { status: 'error', message: '로그인이 필요합니다.' };
  if (await rateLimited(userId, 'profileEdit'))
    return { status: 'error', message: '요청이 너무 빠릅니다. 잠시 후 다시 시도해 주세요.' };
  const blocked = await actionBlock();
  if (blocked) return { status: 'error', message: '잠시 후 다시 시도해 주세요.' };

  let rid: bigint;
  try {
    rid = BigInt(runeId);
  } catch {
    return { status: 'error', message: '룬을 찾을 수 없습니다.' };
  }
  const serverId = await getActiveServerId();

  try {
    const res = await db.transaction(async (tx) => {
      // 캐릭터 행 잠금 — 동시 장착 경합 직렬화(쿨 이중우회 방지).
      const [ch] = await tx
        .select({ equipped: characters.equippedRuneId, changedAt: characters.runeChangedAt })
        .from(characters)
        .where(and(eq(characters.userId, userId), eq(characters.serverId, serverId)))
        .for('update');
      if (!ch) return { status: 'error' as const, message: '캐릭터를 찾을 수 없습니다.' };

      // 소유권 — 내 룬(같은 서버)만.
      const [rune] = await tx
        .select({ id: runes.id })
        .from(runes)
        .where(and(eq(runes.id, rid), eq(runes.userId, userId), eq(runes.serverId, serverId)))
        .limit(1);
      if (!rune) return { status: 'error' as const, message: '룬을 찾을 수 없습니다.' };

      if (ch.equipped === rid) return { status: 'success' as const, gemsSpent: 0 }; // 이미 장착(no-op)

      // 교체 쿨 — 최초 장착(equipped null)은 무쿨.
      let gemsSpent = 0;
      if (ch.equipped != null && ch.changedAt != null) {
        const remainingMs = ch.changedAt.getTime() + RUNE_SWAP_COOLDOWN_MS - Date.now();
        if (remainingMs > 0) {
          const gemCost = Math.ceil(remainingMs / GEM_TO_MS);
          if (!useGems) return { status: 'cooldown' as const, remainingMs, gemCost };
          const paid = await walletTrySpend(tx, userId, serverId, gemCost);
          if (!paid) return { status: 'error' as const, message: '다이아가 부족합니다.' };
          gemsSpent = gemCost;
        }
      }

      await tx
        .update(characters)
        .set({ equippedRuneId: rid, runeChangedAt: new Date() })
        .where(and(eq(characters.userId, userId), eq(characters.serverId, serverId)));
      return { status: 'success' as const, gemsSpent };
    });
    if (res.status === 'success') revalidatePath('/me/runes');
    return res;
  } catch (e) {
    console.error('[rune.equip]', e);
    return { status: 'error', message: '잠시 후 다시 시도해 주세요.' };
  }
}
