import 'server-only';

import { sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { mileageForKrw } from '@/lib/game/balance';

import type { PointEntry, PointsOverview } from './types';

/**
 * 포인트 지갑(docs/POINT-SHOP.md) — 대난투 포인트·마일리지 **둘 다 서버별**(마일리지는 0211부터: 결제한
 * 서버에 쌓이고 그 서버에서만 쓴다). 원장(point_ledger)이 정본이고 잔액은 캐시. 모든 적립·회수는
 * (kind, ref) 멱등 키로 한 번만 반영된다.
 * 호출부 트랜잭션의 잠금 순서: iap_orders → monthly_purchase_limits → **mileage_wallets** → battlepass → characters …
 * (마일리지를 characters 행에 두지 않는 이유가 이 순서다 — 0211 주석 참조)
 */
/** ⚠ 원장 INSERT와 캐시 UPDATE 두 문장이라 **트랜잭션(또는 세이브포인트)** 안에서만 부를 것 — 그 사이 실패하면 멱등 키가 남아 재시도해도 캐시가 안 맞는다(점검 반영). */
type Dbx = Pick<typeof db, 'execute'>;

/** 대난투 발표 — 순위 포인트와 같은 수치를 잔액에 더한다(감쇠 없음). 같은 (battle, user)는 한 번만. */
export async function creditMeleePoints(
  dbx: Dbx,
  p: { userId: string; serverId: number; battleId: bigint | number | string; points: number; note: string; at?: Date },
): Promise<boolean> {
  if (p.points <= 0) return false;
  const ref = `melee:${String(p.battleId)}:${p.userId}`;
  const r = (await dbx.execute(sql`
    insert into point_ledger (user_id, server_id, kind, delta, note, ref, created_at)
    values (${p.userId}::uuid, ${p.serverId}, 'melee', ${p.points}, ${p.note}, ${ref}, ${p.at ? p.at.toISOString() : sql`now()`})
    on conflict (kind, ref) where ref is not null do nothing
    returning id
  `)) as unknown as { id: string }[];
  if (r.length === 0) return false;
  await dbx.execute(sql`
    update characters set melee_points = melee_points + ${p.points}
    where user_id = ${p.userId}::uuid and server_id = ${p.serverId}
  `);
  return true;
}

/**
 * 결제 완료 — 결제액의 마일리지(100원=1점)를 **그 주문의 서버** 지갑에. 같은 주문은 한 번만.
 * 반환 = 적립 점수(0이면 미적립).
 */
export async function creditMileageForOrder(
  dbx: Dbx,
  p: { userId: string; serverId: number; orderId: bigint | number | string; amountKrw: number; note: string; at?: Date },
): Promise<number> {
  const pts = mileageForKrw(p.amountKrw);
  if (pts <= 0) return 0;
  const ref = `order:${String(p.orderId)}`;
  const r = (await dbx.execute(sql`
    insert into point_ledger (user_id, server_id, kind, delta, note, ref, created_at)
    values (${p.userId}::uuid, ${p.serverId}, 'mileage', ${pts}, ${p.note}, ${ref}, ${p.at ? p.at.toISOString() : sql`now()`})
    on conflict (kind, ref) where ref is not null do nothing
    returning id
  `)) as unknown as { id: string }[];
  if (r.length === 0) return 0;
  await dbx.execute(sql`
    insert into mileage_wallets (user_id, server_id, balance) values (${p.userId}::uuid, ${p.serverId}, ${pts})
    on conflict (user_id, server_id) do update set balance = mileage_wallets.balance + ${pts}
  `);
  return pts;
}

/**
 * 환불 확정 — 그 주문이 적립한 마일리지를 회수. 잔액이 모자라면 있는 만큼만 회수하고 부족분을 note에 남긴다
 * (다이아 회수 부족분과 같은 원칙 — 이미 쓴 만큼은 기록만). 같은 주문은 한 번만.
 */
export async function revokeMileageForOrder(
  dbx: Dbx,
  p: { userId: string; orderId: bigint | number | string },
): Promise<{ credited: number; taken: number; already?: boolean }> {
  const ref = `order:${String(p.orderId)}`;
  // 회수는 **적립된 그 서버** 지갑에서 — 적립 행이 서버를 들고 있다(0211 이전 행은 0211이 채웠다).
  const [c] = (await dbx.execute(sql`
    select delta::text as d, coalesce(server_id, 1)::int as sid
      from point_ledger where kind = 'mileage' and ref = ${ref}
  `)) as unknown as { d: string; sid: number }[];
  const credited = Number(c?.d ?? 0);
  if (credited <= 0 || !c) return { credited: 0, taken: 0 };
  const [bal] = (await dbx.execute(sql`
    select balance::text as m from mileage_wallets
     where user_id = ${p.userId}::uuid and server_id = ${c.sid} for update
  `)) as unknown as { m: string }[];
  const have = Number(bal?.m ?? 0);
  const taken = Math.max(0, Math.min(have, credited));
  const short = credited - taken;
  const r = (await dbx.execute(sql`
    insert into point_ledger (user_id, server_id, kind, delta, note, ref)
    values (${p.userId}::uuid, ${c.sid}, 'mileage', ${-taken}, ${short > 0 ? `환불 회수 (부족 ${short})` : '환불 회수'}, ${ref + ':refund'})
    on conflict (kind, ref) where ref is not null do nothing
    returning id
  `)) as unknown as { id: string }[];
  if (r.length === 0) return { credited, taken: 0, already: true }; // 이미 회수됨
  if (taken > 0) {
    await dbx.execute(sql`
      update mileage_wallets set balance = balance - ${taken}
       where user_id = ${p.userId}::uuid and server_id = ${c.sid}
    `);
  }
  return { credited, taken };
}

/** 상점 포인트 탭 — 잔액 2종 + 최근 적립/사용 10건씩(ⓘ 팝업 목록). 둘 다 활성 서버 기준. */
export async function getPointsOverview(userId: string, serverId: number): Promise<PointsOverview> {
  const [bal] = (await db.execute(sql`
    select coalesce((select melee_points from characters where user_id = ${userId}::uuid and server_id = ${serverId}), 0)::text as mp,
           coalesce((select balance from mileage_wallets where user_id = ${userId}::uuid and server_id = ${serverId}), 0)::text as ml
  `)) as unknown as { mp: string; ml: string }[];
  const rows = (await db.execute(sql`
    (select id::text as id, kind, to_char(created_at at time zone 'Asia/Seoul', 'FMMM/FMDD') as date, note, delta::text as delta
       from point_ledger where user_id = ${userId}::uuid and kind = 'melee' and server_id = ${serverId}
       order by created_at desc, id desc limit 10)
    union all
    (select id::text, kind, to_char(created_at at time zone 'Asia/Seoul', 'FMMM/FMDD'), note, delta::text
       from point_ledger where user_id = ${userId}::uuid and kind = 'mileage' and server_id = ${serverId}
       order by created_at desc, id desc limit 10)
  `)) as unknown as { id: string; kind: 'melee' | 'mileage'; date: string; note: string; delta: string }[];
  const toEntry = (r: (typeof rows)[number]): PointEntry => ({ id: r.id, date: r.date, note: r.note, delta: Number(r.delta) });
  return {
    melee: { balance: Number(bal?.mp ?? 0), recent: rows.filter((r) => r.kind === 'melee').map(toEntry) },
    mileage: { balance: Number(bal?.ml ?? 0), recent: rows.filter((r) => r.kind === 'mileage').map(toEntry) },
  };
}
