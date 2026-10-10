'use server';

import { revalidatePath } from 'next/cache';

import { sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { getSessionUserId } from '@/lib/auth/session';
import { actionBlock } from '@/lib/game/action-gate';
import { POINT_EXTRA_PRICES, pointExtraPrice, type PointExtraItem } from '@/lib/game/balance';
import { buyExtra } from '@/lib/game/points/extra';
import { PointShopError, exchangePoints, type ExchangeTarget } from '@/lib/game/points/spend';
import type { PointKind } from '@/lib/game/points/types';
import { getActiveServerId } from '@/lib/game/servers';
import { kstDateString } from '@/lib/kst';
import { rateLimited } from '@/lib/ratelimit';

/** 추가 횟수 팝업이 열릴 때 — 두 통화 잔액·오늘 산 횟수·이번 가격(대난투 포인트). 조회만. */
export async function extraQuoteAction(item: PointExtraItem) {
  const u = await getSessionUserId();
  if (!u) return { status: 'error', code: 'UNAUTHENTICATED' } as const;
  if (typeof item !== 'string' || !Object.hasOwn(POINT_EXTRA_PRICES, item)) return { status: 'error', code: 'BAD_REQUEST' } as const;
  const serverId = await getActiveServerId();
  // 한 번의 왕복으로(잔액 둘 + 오늘 산 횟수) — ＋가 보이는 화면마다 불리는 조회라 커넥션을 하나만 쓴다.
  const [row] = (await db.execute(sql`
    select coalesce((select melee_points from characters where user_id = ${u}::uuid and server_id = ${serverId}), 0)::bigint::text as mp,
           coalesce((select balance from mileage_wallets where user_id = ${u}::uuid and server_id = ${serverId}), 0)::bigint::text as ml,
           (select coalesce(sum(count), 0)::int from point_extra_buys
             where user_id = ${u}::uuid and server_id = ${serverId} and kst_date = ${kstDateString()}::date and item = ${item}) as bought
  `)) as unknown as { mp: string; ml: string; bought: number }[];
  const bought = Number(row?.bought ?? 0);
  return {
    status: 'success',
    melee: Number(row?.mp ?? 0),
    mileage: Number(row?.ml ?? 0),
    bought,
    max: POINT_EXTRA_PRICES[item].length,
    price: pointExtraPrice(item, bought),
  } as const;
}

const PAGE: Record<PointExtraItem, string> = { expedition: '/expedition', raid: '/raid', tower: '/tower' };

/** 추가 횟수 한 장 사기(docs/POINT-SHOP.md §6). key = 구매 시도마다 클라가 만든 값(재전송 한 번만). */
export async function buyExtraAction(input: { item: PointExtraItem; kind: PointKind; qty?: number; key: string; expectedPrice?: number }) {
  const u = await getSessionUserId();
  if (!u) return { status: 'error', code: 'UNAUTHENTICATED' } as const;
  if (await rateLimited(u, 'shop')) return { status: 'error', code: 'RATE_LIMITED' } as const;
  const __b = await actionBlock(); if (__b) return { status: 'error', code: __b } as const;
  try {
    const r = await buyExtra(u, await getActiveServerId(), input);
    revalidatePath(PAGE[input.item]);
    revalidatePath('/');
    return { status: 'success', ...r } as const;
  } catch (e) {
    if (e instanceof PointShopError) return { status: 'error', code: e.code } as const;
    console.error('[points.buyExtra]', e);
    return { status: 'error', code: 'UNKNOWN' } as const;
  }
}

/** 교환 한 번(docs/POINT-SHOP.md §5) — 고정 수량 10·50·100pt, 💎 또는 고른 부위 상자. 월 한도 없음. */
export async function exchangeAction(input: { kind: PointKind; target: ExchangeTarget; pack: number; key: string }) {
  const u = await getSessionUserId();
  if (!u) return { status: 'error', code: 'UNAUTHENTICATED' } as const;
  if (await rateLimited(u, 'shop')) return { status: 'error', code: 'RATE_LIMITED' } as const;
  const __b = await actionBlock(); if (__b) return { status: 'error', code: __b } as const;
  try {
    const r = await exchangePoints(u, await getActiveServerId(), input);
    revalidatePath('/shop');
    revalidatePath('/');
    return { status: 'success', ...r } as const;
  } catch (e) {
    if (e instanceof PointShopError) return { status: 'error', code: e.code } as const;
    console.error('[points.exchange]', e);
    return { status: 'error', code: 'UNKNOWN' } as const;
  }
}
