'use server';

import { revalidatePath } from 'next/cache';
import { and, eq, inArray } from 'drizzle-orm';

import { getSessionUserId } from '@/lib/auth/session';
import { rateLimited } from '@/lib/ratelimit';
import { db } from '@/lib/db/client';
import { catalogItems, type Slot } from '@/lib/db/schema/equipment';
import { userSupplyBoxes } from '@/lib/db/schema/supply';
import { openSupplyBoxes, SupplyError } from '@/lib/game/supply';
import { championCatalogIds } from '@/lib/game/codex/ranking';
import { loreTeaser } from '@/lib/game/equipment/lore';

export type OpenedItem = {
  catalogItemId: number;
  code: string;
  name: string;
  isNew: boolean;
  isChampion: boolean;
  /** 신규 해금 시 보여줄 로어 티저(1~2문장). 중복/없음=null. */
  loreTeaser: string | null;
  gemDrop: number;
};
export type OpenActionResult =
  | { status: 'success'; results: OpenedItem[]; remaining: number; gemTotal: number }
  | { status: 'error'; code: string; message: string };

const MSG: Record<string, string> = {
  NO_BOX: '보급 상자가 부족합니다.',
  NO_CATALOG: '해당 슬롯 카탈로그가 없습니다.',
  UNAUTHENTICATED: '로그인이 필요합니다.',
  RATE_LIMITED: '요청이 너무 빠릅니다. 잠시 후 다시 시도해 주세요.',
  UNKNOWN: '알 수 없는 오류',
};

export async function openAction(slot: Slot, count: number): Promise<OpenActionResult> {
  const userId = await getSessionUserId();
  if (!userId) return { status: 'error', code: 'UNAUTHENTICATED', message: MSG.UNAUTHENTICATED! };
  if (await rateLimited(userId, 'gacha'))
    return { status: 'error', code: 'RATE_LIMITED', message: MSG.RATE_LIMITED! };
  // count 1~10 범위 클램프 — UI에서도 동일 보장(보유량 < 10이면 보유량까지).
  const n = Math.max(1, Math.min(10, Math.floor(count)));
  try {
    const opened = await openSupplyBoxes({ userId, slot, count: n });
    const ids = [...new Set(opened.map((o) => o.catalogItemId))];
    const [meta, champSet, boxRows] = await Promise.all([
      ids.length
        ? db
            .select({ id: catalogItems.id, code: catalogItems.code, name: catalogItems.name })
            .from(catalogItems)
            .where(inArray(catalogItems.id, ids))
        : Promise.resolve([] as { id: number; code: string; name: string }[]),
      championCatalogIds(userId),
      db
        .select({ c: userSupplyBoxes.count })
        .from(userSupplyBoxes)
        .where(and(eq(userSupplyBoxes.userId, userId), eq(userSupplyBoxes.slot, slot)))
        .limit(1),
    ]);
    const metaMap = new Map(meta.map((m) => [m.id, m]));
    const boxRow = boxRows[0];

    revalidatePath('/gacha');
    revalidatePath('/inventory');
    revalidatePath('/');
    return {
      status: 'success',
      results: opened.map((o) => {
        const code = metaMap.get(o.catalogItemId)?.code ?? '';
        return {
          catalogItemId: o.catalogItemId,
          code,
          name: metaMap.get(o.catalogItemId)?.name ?? `#${o.catalogItemId}`,
          isNew: o.isNew,
          isChampion: champSet.has(o.catalogItemId),
          loreTeaser: o.isNew && code ? loreTeaser(code) : null,
          gemDrop: o.gemDrop,
        };
      }),
      remaining: Number(boxRow?.c ?? 0n),
      gemTotal: opened.reduce((s, o) => s + o.gemDrop, 0),
    };
  } catch (e) {
    if (e instanceof SupplyError) return { status: 'error', code: e.code, message: MSG[e.code] ?? e.code };
    console.error('[gacha.open]', e);
    return { status: 'error', code: 'UNKNOWN', message: MSG.UNKNOWN! };
  }
}
