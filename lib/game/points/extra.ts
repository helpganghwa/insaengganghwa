import 'server-only';

import { sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { pointExtraPrice, type PointExtraItem } from '@/lib/game/balance';
import { ExpeditionError, expeditionResendApply, expeditionResendCheck } from '@/lib/game/expedition/service';
import { raidExtraCheck } from '@/lib/game/raid/open';
import { towerExtraCheck } from '@/lib/game/tower/service';
import { kstDateString } from '@/lib/kst';

import { PointShopError, costIn, spendPoints } from './spend';
import type { PointKind } from './types';

export type ExtraBuyResult = {
  item: PointExtraItem;
  slot: number;
  kind: PointKind;
  /** 이번에 낸 양(고른 통화 단위). */
  spent: number;
  /** 오늘 이 상품을 산 횟수(파견은 전체 칸 합). */
  bought: number;
  /** 다음 구매 값(대난투 포인트) — 더 못 사면 null. */
  next: number | null;
  duplicate: boolean;
};

const ITEM_KO: Record<PointExtraItem, string> = { expedition: '파견 다시 보내기', raid: '오늘 레이드 +1회', tower: '탑 추가 도전' };

/**
 * 추가 횟수 사기(docs/POINT-SHOP.md §6) — 한 번에 한 장. 가격 = 오늘 이 상품을 산 횟수로 정한 값(POINT_EXTRA_PRICES).
 * 한 트랜잭션: 콘텐츠 검사(잠금) → 오늘 구매 행 잠금 → 지출(멱등 키) → 횟수 +1 → 적용(파견은 새 파견지).
 * 잠금 순서: 콘텐츠 행(expedition_state·tower_progress) → point_extra_buys → mileage_wallets → characters.
 * key = 클라가 구매 시도마다 만든 값 — 같은 요청이 두 번 와도 한 번만 산다.
 */
export async function buyExtra(
  userId: string,
  serverId: number,
  input: { item: PointExtraItem; kind: PointKind; slot?: number; key: string },
): Promise<ExtraBuyResult> {
  const { item, kind } = input;
  if (!(item in { expedition: 1, raid: 1, tower: 1 })) throw new PointShopError('BAD_REQUEST');
  if (kind !== 'melee' && kind !== 'mileage') throw new PointShopError('BAD_REQUEST');
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(input.key)) throw new PointShopError('BAD_REQUEST');
  const slot = item === 'expedition' ? Number(input.slot) : 0;
  if (item === 'expedition' && !(Number.isInteger(slot) && slot >= 1)) throw new PointShopError('BAD_REQUEST');
  const day = kstDateString();

  return db.transaction(async (tx) => {
    // ① 콘텐츠 검사 — 지금 한도가 찼을 때만(화면의 ＋와 같은 조건). 지출 전에 막아 쓸모없는 구매를 없앤다.
    if (item === 'expedition') {
      try {
        await expeditionResendCheck(tx, userId, serverId, slot);
      } catch (e) {
        if (e instanceof ExpeditionError) {
          if (e.code === 'SLOT_LOCKED') throw new PointShopError('SLOT_LOCKED');
          if (e.code === 'DAILY_LIMIT') throw new PointShopError('SLOT_BUSY');
          throw new PointShopError('NOT_NEEDED');
        }
        throw e;
      }
    } else if (item === 'raid') {
      if ((await raidExtraCheck(tx, userId, serverId)) === 'not_needed') throw new PointShopError('NOT_NEEDED');
    } else if ((await towerExtraCheck(tx, userId, serverId)) === 'not_needed') {
      throw new PointShopError('NOT_NEEDED');
    }

    // ② 오늘 구매 행 — 만들고 그 상품의 오늘 행 전부를 잠근다(파견은 칸이 달라도 가격은 상품 전체 횟수로).
    await tx.execute(sql`
      insert into point_extra_buys (user_id, server_id, kst_date, item, slot)
      values (${userId}::uuid, ${serverId}, ${day}::date, ${item}, ${slot})
      on conflict do nothing
    `);
    const rows = (await tx.execute(sql`
      select count from point_extra_buys
      where user_id = ${userId}::uuid and server_id = ${serverId} and kst_date = ${day}::date and item = ${item}
      for update
    `)) as unknown as { count: number }[];
    const bought = rows.reduce((a, r) => a + Number(r.count), 0);
    const price = pointExtraPrice(item, bought);

    // ③ 지출 — 같은 키면 이미 산 요청(횟수 그대로 돌려준다).
    const ref = `extra:${userId}:${input.key}`;
    if (price === null) {
      const [dup] = (await tx.execute(sql`select 1 from point_ledger where kind = ${kind} and ref = ${ref}`)) as unknown as unknown[];
      if (dup) return { item, slot, kind, spent: 0, bought, next: null, duplicate: true };
      throw new PointShopError('MAX_REACHED');
    }
    const spent = costIn(kind, price);
    const fresh = await spendPoints(tx, { userId, serverId, kind, amount: spent, note: `${ITEM_KO[item]}${item === 'expedition' ? ` (${slot}칸)` : ''}`, ref });
    if (!fresh) return { item, slot, kind, spent: 0, bought, next: price, duplicate: true };

    // ④ 횟수 +1 → ⑤ 적용.
    await tx.execute(sql`
      update point_extra_buys set count = count + 1
      where user_id = ${userId}::uuid and server_id = ${serverId} and kst_date = ${day}::date and item = ${item} and slot = ${slot}
    `);
    if (item === 'expedition') await expeditionResendApply(tx, userId, serverId, slot);
    return { item, slot, kind, spent, bought: bought + 1, next: pointExtraPrice(item, bought + 1), duplicate: false };
  });
}
