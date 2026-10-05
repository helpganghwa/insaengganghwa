import 'server-only';

import { sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import {
  MILEAGE_PER_MELEE_POINT,
  POINT_EXCHANGE_BOX,
  POINT_EXCHANGE_DIAMOND,
  POINT_EXCHANGE_PACKS,
  SUPPLY_SLOTS,
  type PointExchangePack,
  type PointExtraItem,
  type SupplySlot,
} from '@/lib/game/balance';
import { kstDateString } from '@/lib/kst';
import { walletAdd } from '@/lib/game/wallet';

import type { PointKind } from './types';

/**
 * 포인트 쓰기(docs/POINT-SHOP.md §5·§6) — 교환과 추가 횟수가 같은 지출 경로를 쓴다.
 * 가격은 대난투 포인트로 정하고, 마일리지로 내면 ×MILEAGE_PER_MELEE_POINT.
 */
type Dbx = Pick<typeof db, 'execute'>;

export class PointShopError extends Error {
  constructor(
    public code:
      | 'INSUFFICIENT_POINTS'
      | 'MAX_REACHED'
      | 'NOT_NEEDED'
      | 'BAD_REQUEST'
      | 'SLOT_LOCKED'
      | 'SLOT_BUSY'
      | 'NO_CHARACTER'
      | 'PRICE_CHANGED',
  ) {
    super(code);
  }
}

/** 대난투 포인트 가격 → 고른 통화로 낼 양. */
export function costIn(kind: PointKind, pricePt: number): number {
  return kind === 'mileage' ? pricePt * MILEAGE_PER_MELEE_POINT : pricePt;
}

/**
 * 지출 — 원장 먼저(멱등 키), 그다음 조건부 차감. 같은 ref가 이미 있으면 false(이미 처리된 요청).
 * 잔액이 모자라면 INSUFFICIENT_POINTS를 던져 호출부 트랜잭션째 되돌린다.
 * ⚠ 트랜잭션 안에서만 부를 것(원장 INSERT와 잔액 UPDATE 두 문장).
 */
export async function spendPoints(
  dbx: Dbx,
  p: { userId: string; serverId: number; kind: PointKind; amount: number; note: string; ref: string },
): Promise<boolean> {
  if (!Number.isInteger(p.amount) || p.amount <= 0) throw new PointShopError('BAD_REQUEST');
  const r = (await dbx.execute(sql`
    insert into point_ledger (user_id, server_id, kind, delta, note, ref)
    values (${p.userId}::uuid, ${p.serverId}, ${p.kind}, ${-p.amount}, ${p.note}, ${p.ref})
    on conflict (kind, ref) where ref is not null do nothing
    returning id
  `)) as unknown as { id: string }[];
  if (r.length === 0) return false;
  const upd = (
    p.kind === 'melee'
      ? await dbx.execute(sql`
          update characters set melee_points = melee_points - ${p.amount}
          where user_id = ${p.userId}::uuid and server_id = ${p.serverId} and melee_points >= ${p.amount}
          returning 1`)
      : await dbx.execute(sql`
          update mileage_wallets set balance = balance - ${p.amount}
          where user_id = ${p.userId}::uuid and server_id = ${p.serverId} and balance >= ${p.amount}
          returning 1`)
  ) as unknown as unknown[];
  if (upd.length === 0) throw new PointShopError('INSUFFICIENT_POINTS');
  return true;
}

/** 오늘(KST) 산 추가 횟수 — 파견은 slot을 주면 그 칸만, 안 주면 전체 칸 합. */
export async function extrasToday(
  dbx: Dbx,
  userId: string,
  serverId: number,
  item: PointExtraItem,
  slot?: number,
  day: string = kstDateString(),
): Promise<number> {
  const [r] = (await dbx.execute(sql`
    select coalesce(sum(count), 0)::int as n from point_extra_buys
    where user_id = ${userId}::uuid and server_id = ${serverId} and kst_date = ${day}::date and item = ${item}
      ${slot === undefined ? sql`` : sql`and slot = ${slot}`}
  `)) as unknown as { n: number }[];
  return Number(r?.n ?? 0);
}

export type ExchangeTarget = 'diamond' | SupplySlot;

/**
 * 교환 — 고정 수량(10·50·100pt) 한 번. key는 클라가 요청마다 만든 값(같은 요청 재전송은 한 번만 처리).
 * 월 한도 없음(10-05 확정). 받는 것: 💎(pt×25) 또는 고른 부위 상자(pt×1).
 */
export async function exchangePoints(
  userId: string,
  serverId: number,
  input: { kind: PointKind; target: ExchangeTarget; pack: number; key: string },
): Promise<{ diamond: number; boxes: number; slot: SupplySlot | null; spent: number; duplicate: boolean }> {
  if (input.kind !== 'melee' && input.kind !== 'mileage') throw new PointShopError('BAD_REQUEST');
  const pack = input.pack as PointExchangePack;
  if (!(POINT_EXCHANGE_PACKS as readonly number[]).includes(pack)) throw new PointShopError('BAD_REQUEST');
  if (input.target !== 'diamond' && !(SUPPLY_SLOTS as readonly string[]).includes(input.target)) throw new PointShopError('BAD_REQUEST');
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(input.key)) throw new PointShopError('BAD_REQUEST');
  const spent = costIn(input.kind, pack);
  const diamond = input.target === 'diamond' ? pack * POINT_EXCHANGE_DIAMOND : 0;
  const boxes = input.target === 'diamond' ? 0 : pack * POINT_EXCHANGE_BOX;
  const slot = input.target === 'diamond' ? null : input.target;
  const ref = `ex:${userId}:${input.key}`;
  const note = diamond > 0 ? `교환 💎${diamond.toLocaleString('ko-KR')}` : `교환 📦${boxes} (${SLOT_KO[slot!]})`;

  const duplicate = await db.transaction(async (tx) => {
    const fresh = await spendPoints(tx, { userId, serverId, kind: input.kind, amount: spent, note, ref });
    if (!fresh) return true;
    if (diamond > 0) {
      await walletAdd(tx, userId, serverId, diamond, input.kind === 'melee' ? 'point_exchange_melee' : 'point_exchange_mileage', ref);
    } else {
      await tx.execute(sql`
        insert into user_supply_boxes (user_id, server_id, slot, count)
        values (${userId}::uuid, ${serverId}, ${slot}, ${boxes})
        on conflict (user_id, server_id, slot) do update set count = user_supply_boxes.count + ${boxes}
      `);
    }
    return false;
  });
  return { diamond, boxes, slot, spent, duplicate };
}

const SLOT_KO: Record<SupplySlot, string> = { weapon: '무기', armor: '방어구', accessory: '장신구' };
