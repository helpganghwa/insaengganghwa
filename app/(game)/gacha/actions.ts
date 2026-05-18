'use server';

import { revalidatePath } from 'next/cache';
import { and, eq, inArray } from 'drizzle-orm';

import { getSessionUserId } from '@/lib/auth/session';
import { db } from '@/lib/db/client';
import { catalogItems, type Slot } from '@/lib/db/schema/equipment';
import { userSupplyBoxes } from '@/lib/db/schema/supply';
import { openSupplyBoxes, SupplyError } from '@/lib/game/supply';

export type OpenedItem = { catalogItemId: number; name: string; isNew: boolean; gemDrop: number };
export type OpenActionResult =
  | { status: 'success'; results: OpenedItem[]; remaining: number; gemTotal: number }
  | { status: 'error'; code: string; message: string };

const MSG: Record<string, string> = {
  NO_BOX: '보급 상자가 부족합니다.',
  NO_CATALOG: '해당 슬롯 카탈로그가 없습니다.',
  UNAUTHENTICATED: '로그인이 필요합니다.',
  UNKNOWN: '알 수 없는 오류',
};

export async function openAction(slot: Slot, count: 1 | 10): Promise<OpenActionResult> {
  const userId = await getSessionUserId();
  if (!userId) return { status: 'error', code: 'UNAUTHENTICATED', message: MSG.UNAUTHENTICATED! };
  try {
    const opened = await openSupplyBoxes({ userId, slot, count });
    const ids = [...new Set(opened.map((o) => o.catalogItemId))];
    const names = ids.length
      ? await db
          .select({ id: catalogItems.id, name: catalogItems.name })
          .from(catalogItems)
          .where(inArray(catalogItems.id, ids))
      : [];
    const nameMap = new Map(names.map((n) => [n.id, n.name]));
    const [boxRow] = await db
      .select({ c: userSupplyBoxes.count })
      .from(userSupplyBoxes)
      .where(and(eq(userSupplyBoxes.userId, userId), eq(userSupplyBoxes.slot, slot)))
      .limit(1);

    revalidatePath('/gacha');
    revalidatePath('/inventory');
    revalidatePath('/');
    return {
      status: 'success',
      results: opened.map((o) => ({
        catalogItemId: o.catalogItemId,
        name: nameMap.get(o.catalogItemId) ?? `#${o.catalogItemId}`,
        isNew: o.isNew,
        gemDrop: o.gemDrop,
      })),
      remaining: Number(boxRow?.c ?? 0n),
      gemTotal: opened.reduce((s, o) => s + o.gemDrop, 0),
    };
  } catch (e) {
    if (e instanceof SupplyError) return { status: 'error', code: e.code, message: MSG[e.code] ?? e.code };
    console.error('[gacha.open]', e);
    return { status: 'error', code: 'UNKNOWN', message: MSG.UNKNOWN! };
  }
}
