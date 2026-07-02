'use server';

import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';

import { getSessionUserId } from '@/lib/auth/session';
import { getActiveServerId } from '@/lib/game/servers';
import { rateLimited } from '@/lib/ratelimit';
import { actionBlock } from '@/lib/game/action-gate';
import { db } from '@/lib/db/client';
import { type Slot } from '@/lib/db/schema/equipment';
import { userSupplyBoxes } from '@/lib/db/schema/supply';
import { openSupplyBoxes, SupplyError } from '@/lib/game/supply';
import { getActiveCatalog, completeCatalog } from '@/lib/game/catalog';
import { liberatedItemRanks } from '@/lib/game/codex/ranking';
import { loreTeaser } from '@/lib/game/equipment/lore';

export type OpenedItem = {
  catalogItemId: number;
  code: string;
  name: string;
  isNew: boolean;
  /** 해방 등수(강화랭킹 1~3위) — 후광 색용. null=해방 아님. */
  championRank: number | null;
  /** 이번 열기로 자동 초월된 단계 수(중복 누적이 임계 도달 시 ≥1). */
  transcended: number;
  /** 결과 초월 레벨. */
  transcendLevel: number;
  /** 결과 초월 진행도(다음 초월 임계 = transcendLevel+1). 게이지용. */
  transcendProgress: number;
  /** 신규 해금 시 보여줄 로어 티저(1~2문장). 중복/없음=null. */
  loreTeaser: string | null;
};
export type OpenActionResult =
  | { status: 'success'; results: OpenedItem[]; remaining: number }
  | { status: 'error'; code: string; message: string };

const MSG: Record<string, string> = {
  NO_BOX: '보급 상자가 부족합니다.',
  NO_CATALOG: '해당 슬롯 카탈로그가 없습니다.',
  UNAUTHENTICATED: '로그인이 필요합니다.',
  RATE_LIMITED: '요청이 너무 빠릅니다. 잠시 후 다시 시도해 주세요.',
  MAINTENANCE: '점검 중입니다. 잠시 후 다시 시도해 주세요.',
  BANNED: '이용이 제한된 계정입니다.',
  UNKNOWN: '알 수 없는 오류',
};

export async function openAction(slot: Slot, count: number): Promise<OpenActionResult> {
  const userId = await getSessionUserId();
  if (!userId) return { status: 'error', code: 'UNAUTHENTICATED', message: MSG.UNAUTHENTICATED! };
  if (await rateLimited(userId, 'gacha'))
    return { status: 'error', code: 'RATE_LIMITED', message: MSG.RATE_LIMITED! };
  const __b = await actionBlock();
  if (__b) return { status: 'error', code: __b, message: MSG[__b] ?? __b };
  // count 1~10 범위 클램프 — UI에서도 동일 보장(보유량 < 10이면 보유량까지).
  // NaN/Infinity 방어 — 유효하지 않으면 1개(Math.floor(NaN) 클램프가 NaN을 통과시키는 버그 차단).
  const parsed = Math.floor(count);
  const n = Number.isFinite(parsed) ? Math.max(1, Math.min(10, parsed)) : 1;
  try {
    const opened = await openSupplyBoxes({ userId, serverId: await getActiveServerId(), slot, count: n });
    // 개봉 아이템은 항상 active 풀에서 나오므로 캐시된 활성 카탈로그로 메타 조회(DB 왕복 제거).
    const [catalog, libRanks, boxRows] = await Promise.all([
      getActiveCatalog(),
      liberatedItemRanks(userId, await getActiveServerId()),
      db
        .select({ c: userSupplyBoxes.count })
        .from(userSupplyBoxes)
        .where(
          and(
            eq(userSupplyBoxes.userId, userId),
            eq(userSupplyBoxes.serverId, await getActiveServerId()),
            eq(userSupplyBoxes.slot, slot),
          ),
        )
        .limit(1),
    ]);
    const metaMap = new Map(catalog.map((m) => [m.id, m]));
    // 캐시에 없는 신규 카탈로그(추가 직후) 보강 — 개봉 결과 메타 누락 방지.
    await completeCatalog(metaMap, opened.map((o) => o.catalogItemId));
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
          championRank: libRanks.get(o.catalogItemId) ?? null,
          transcended: o.transcended,
          transcendLevel: o.transcendLevel,
          transcendProgress: o.transcendProgress,
          loreTeaser: o.isNew && code ? loreTeaser(code) : null,
        };
      }),
      remaining: Number(boxRow?.c ?? 0n),
    };
  } catch (e) {
    if (e instanceof SupplyError) return { status: 'error', code: e.code, message: MSG[e.code] ?? e.code };
    console.error('[gacha.open]', e);
    return { status: 'error', code: 'UNKNOWN', message: MSG.UNKNOWN! };
  }
}
