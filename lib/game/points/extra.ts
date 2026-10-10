import 'server-only';

import { sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { POINT_EXTRA_PRICES, pointExtraPrice, type PointExtraItem } from '@/lib/game/balance';
import { expeditionExtraLock, expeditionExtraOpen } from '@/lib/game/expedition/service';
import { raidExtraLock } from '@/lib/game/raid/open';
import { towerExtraLock } from '@/lib/game/tower/service';
import { kstDateString } from '@/lib/kst';

import { PointShopError, costIn, extrasToday, spendPoints } from './spend';
import type { PointKind } from './types';

export type ExtraBuyResult = {
  item: PointExtraItem;
  /** 이번에 산 장 수(파견만 2장 이상 가능). 같은 키의 재전송이면 0. */
  qty: number;
  /** 파견만 — 이번에 연 추가 칸 번호(EXPEDITION_SLOTS+1부터, 비어 있는 번호). 재전송이면 빈 배열. */
  slots: number[];
  kind: PointKind;
  /** 이번에 낸 양(고른 통화 단위, qty장 합). */
  spent: number;
  /** 오늘 이 상품을 산 횟수(이번 구매 포함). */
  bought: number;
  /** 다음 구매 값(대난투 포인트) — 더 못 사면 null. */
  next: number | null;
  duplicate: boolean;
};

const ITEM_KO: Record<PointExtraItem, string> = { expedition: '추가 파견', raid: '오늘 레이드 +1회', tower: '탑 추가 도전' };

/** boughtToday번 산 뒤 qty장을 더 살 때의 값 합(대난투 포인트). 한 장이라도 못 사면 null. */
function priceForQty(item: PointExtraItem, boughtToday: number, qty: number): number | null {
  let sum = 0;
  for (let i = 0; i < qty; i++) {
    const p = pointExtraPrice(item, boughtToday + i);
    if (p === null) return null;
    sum += p;
  }
  return sum;
}

/**
 * 추가 횟수 사기(docs/POINT-SHOP.md §6) — 가격 = 오늘 이 상품을 산 횟수로 정한 값(POINT_EXTRA_PRICES). 파견은 한 번에 여러 장(qty, 10-10),
 * 탑·레이드는 한 장. 한 트랜잭션: 콘텐츠 잠금 → 오늘 구매 행 잠금 → 지출(멱등 키) → 횟수 +qty → 적용(파견은 추가 칸 열고 새 파견지).
 * 셋 다 횟수가 남아 있어도 살 수 있다(탑·레이드 10-06, 파견 10-10 — 추가 파견은 보낼 파견이 있어도 칸을 더 여는 것).
 * 잠금 순서: 콘텐츠 행(expedition_state·raid_daily_counts·tower_progress) → point_extra_buys → mileage_wallets → characters.
 * key = 클라가 구매 시도마다 만든 값 — 같은 요청이 두 번 와도 한 번만 산다.
 */
export async function buyExtra(
  userId: string,
  serverId: number,
  input: { item: PointExtraItem; kind: PointKind; qty?: number; key: string; expectedPrice?: number },
): Promise<ExtraBuyResult> {
  const { item, kind } = input;
  // 문자열만 — 배열(['raid'])은 hasOwn을 통과하면서 아래 분기는 빗나간다(10-06 최종 검수).
  if (typeof item !== 'string' || !Object.hasOwn(POINT_EXTRA_PRICES, item)) throw new PointShopError('BAD_REQUEST');
  if (kind !== 'melee' && kind !== 'mileage') throw new PointShopError('BAD_REQUEST');
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(input.key)) throw new PointShopError('BAD_REQUEST');
  // 장 수 — 파견만 여러 장(하루 최대만큼), 나머지는 1장.
  const qty = input.qty === undefined ? 1 : Number(input.qty);
  if (!(Number.isInteger(qty) && qty >= 1 && qty <= POINT_EXTRA_PRICES[item].length)) throw new PointShopError('BAD_REQUEST');
  if (item !== 'expedition' && qty !== 1) throw new PointShopError('BAD_REQUEST');
  // point_extra_buys의 slot — 파견 '다시 보내기' 시절(10-06~10-10) 칸별로 세던 자리. 지금은 셋 다 0(가격은 상품 전체 횟수로).
  const slot = 0;
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
      return { item, qty: 0, slots: [], kind, spent: 0, bought, next: pointExtraPrice(item, bought), duplicate: true } satisfies ExtraBuyResult;
    };
    const dup0 = await alreadyBought();
    if (dup0) return dup0;

    // ① 콘텐츠 잠금 — 실패하면 같은 키의 첫 요청이 그새 커밋했는지 한 번 더 본다(잠금 대기 뒤라 이제 보인다).
    try {
      if (item === 'expedition') {
        await expeditionExtraLock(tx, userId, serverId);
      } else if (item === 'raid') {
        await raidExtraLock(tx, userId, serverId, day);
      } else {
        await towerExtraLock(tx, userId, serverId);
      }
    } catch (e) {
      // 규칙 위반(PointShopError)일 때만 재확인한다 — DB 오류(교착·잠금 시간 초과)면 트랜잭션이 이미 중단돼
      // 다음 조회가 25P02로 죽고, 로그에는 그 오류만 남아 원래 원인이 사라진다.
      if (!(e instanceof PointShopError)) throw e;
      const dup = await alreadyBought();
      if (dup) return dup;
      throw e;
    }

    // ② 오늘 구매 행 — 만들고 그 상품의 오늘 행 전부를 잠근다(옛 파견 칸별 행이 남아 있어도 가격은 상품 전체 횟수로).
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
    const price = priceForQty(item, bought, qty);

    // 잠금을 잡은 지금, 같은 키가 이미 처리됐는지 통화와 무관하게 한 번 더 본다 — 같은 키의 첫 요청이 잠금을 기다리는
    // 사이 커밋했을 수 있다. 여기서 안 보면 같은 키를 다른 통화로 보낸 요청이 (kind, ref) 유니크를 비켜 한 번 더 산다.
    const dup = await alreadyBought();
    if (dup) return dup;

    // 날짜가 넘어갔으면 사지 않는다 — day는 요청이 들어온 순간의 날짜라, 자정 직전에 들어와 자정 뒤에 처리되는
    // 구매는 '어제' 행에 기록돼 사자마자 소멸한다. 가격 변경과 같은 방식으로 돌려보내 새 날의 값으로 다시 보게 한다.
    const [clock] = (await tx.execute(
      sql`select (clock_timestamp() at time zone 'Asia/Seoul')::date::text as d`,
    )) as unknown as { d: string }[];
    if (clock?.d !== day) throw new PointShopError('PRICE_CHANGED');

    // ③ 지출 — 팝업에서 본 가격과 다르면(다른 탭에서 먼저 샀다) 사지 않고 다시 보여 준다.
    if (price === null) throw new PointShopError('MAX_REACHED');
    if (input.expectedPrice !== undefined && input.expectedPrice !== price) throw new PointShopError('PRICE_CHANGED');
    const spent = costIn(kind, price);
    const fresh = await spendPoints(tx, { userId, serverId, kind, amount: spent, note: `${ITEM_KO[item]}${qty > 1 ? ` ×${qty}` : ''}`, ref });
    if (!fresh) return { item, qty: 0, slots: [], kind, spent: 0, bought, next: pointExtraPrice(item, bought), duplicate: true };

    // ④ 횟수 +qty → ⑤ 적용.
    await tx.execute(sql`
      update point_extra_buys set count = count + ${qty}
      where user_id = ${userId}::uuid and server_id = ${serverId} and kst_date = ${day}::date and item = ${item} and slot = ${slot}
    `);
    const slots = item === 'expedition' ? await expeditionExtraOpen(tx, userId, serverId, qty) : [];
    return { item, qty, slots, kind, spent, bought: bought + qty, next: pointExtraPrice(item, bought + qty), duplicate: false };
  });
}
