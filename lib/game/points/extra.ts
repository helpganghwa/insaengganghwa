import 'server-only';

import { sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { POINT_EXTRA_PRICES, pointExtraPrice, type PointExtraItem } from '@/lib/game/balance';
import { ExpeditionError, expeditionResendApply, expeditionResendCheck } from '@/lib/game/expedition/service';
import { raidExtraLock } from '@/lib/game/raid/open';
import { towerExtraLock } from '@/lib/game/tower/service';
import { kstDateString } from '@/lib/kst';

import { PointShopError, costIn, extrasToday, spendPoints } from './spend';
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
 * 한 트랜잭션: 콘텐츠 잠금(파견은 검사까지) → 오늘 구매 행 잠금 → 지출(멱등 키) → 횟수 +1 → 적용(파견은 새 파견지).
 * 탑·레이드는 횟수가 남아 있어도 살 수 있다(10-06 확정). 파견만 '오늘 다녀온 칸이 있고 보낼 파견이 없을 때'로 막는다.
 * 잠금 순서: 콘텐츠 행(expedition_state·raid_daily_counts·tower_progress) → point_extra_buys → mileage_wallets → characters.
 * key = 클라가 구매 시도마다 만든 값 — 같은 요청이 두 번 와도 한 번만 산다.
 */
export async function buyExtra(
  userId: string,
  serverId: number,
  input: { item: PointExtraItem; kind: PointKind; slot?: number; key: string; expectedPrice?: number },
): Promise<ExtraBuyResult> {
  const { item, kind } = input;
  // 문자열만 — 배열(['raid'])은 hasOwn을 통과하면서 아래 분기는 빗나간다(10-06 최종 검수).
  if (typeof item !== 'string' || !Object.hasOwn(POINT_EXTRA_PRICES, item)) throw new PointShopError('BAD_REQUEST');
  if (kind !== 'melee' && kind !== 'mileage') throw new PointShopError('BAD_REQUEST');
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(input.key)) throw new PointShopError('BAD_REQUEST');
  const slot = item === 'expedition' ? Number(input.slot) : 0;
  if (item === 'expedition' && !(Number.isInteger(slot) && slot >= 1)) throw new PointShopError('BAD_REQUEST');
  const day = kstDateString();

  const ref = `extra:${userId}:${input.key}`;

  return db.transaction(async (tx) => {
    // ⓪ 같은 키로 다시 온 요청(응답 유실 뒤 재전송) — 이미 산 구매다. 콘텐츠 검사보다 먼저 봐야 한다:
    //    파견은 산 뒤엔 그 칸에 오퍼가 생겨 검사가 NOT_NEEDED로 막고, 산 사람이 오류를 보게 된다.
    // 통화와 무관하게 ref로 찾는다(오류 뒤 통화를 바꿔 같은 키로 다시 눌러도 같은 구매).
    // kind를 함께 줘야 (kind, ref) 유니크 인덱스를 탄다 — ref만으로는 원장 전체를 훑는다.
    const alreadyBought = async () => {
      const [prev] = (await tx.execute(
        sql`select 1 from point_ledger where kind in ('melee', 'mileage') and ref = ${ref} limit 1`,
      )) as unknown as unknown[];
      if (!prev) return null;
      const bought = await extrasToday(tx, userId, serverId, item, undefined, day);
      return { item, slot, kind, spent: 0, bought, next: pointExtraPrice(item, bought), duplicate: true } satisfies ExtraBuyResult;
    };
    const dup0 = await alreadyBought();
    if (dup0) return dup0;

    // ① 콘텐츠 잠금(파견은 검사까지) — 실패하면 같은 키의 첫 요청이 그새 커밋했는지 한 번 더 본다(잠금 대기 뒤라 이제 보인다).
    try {
      if (item === 'expedition') {
        try {
          await expeditionResendCheck(tx, userId, serverId, slot, day);
        } catch (e) {
          if (e instanceof ExpeditionError) {
            if (e.code === 'SLOT_LOCKED') throw new PointShopError('SLOT_LOCKED');
            if (e.code === 'DAILY_LIMIT') throw new PointShopError('SLOT_BUSY');
            throw new PointShopError('NOT_NEEDED');
          }
          throw e;
        }
      } else if (item === 'raid') {
        await raidExtraLock(tx, userId, serverId, day);
      } else {
        await towerExtraLock(tx, userId, serverId);
      }
    } catch (e) {
      const dup = await alreadyBought();
      if (dup) return dup;
      throw e;
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

    // ③ 지출 — 팝업에서 본 가격과 다르면(다른 탭에서 먼저 샀다) 사지 않고 다시 보여 준다.
    if (price === null || (input.expectedPrice !== undefined && input.expectedPrice !== price)) {
      // 같은 키의 첫 요청이 잠금을 기다리는 사이 커밋했을 수 있다 — 그러면 가격이 바뀐 게 아니라 이미 산 구매다.
      const dup = await alreadyBought();
      if (dup) return dup;
      throw new PointShopError(price === null ? 'MAX_REACHED' : 'PRICE_CHANGED');
    }
    const spent = costIn(kind, price);
    const fresh = await spendPoints(tx, { userId, serverId, kind, amount: spent, note: `${ITEM_KO[item]}${item === 'expedition' ? ` (슬롯 ${slot})` : ''}`, ref });
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
