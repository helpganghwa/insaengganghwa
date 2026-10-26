import 'server-only';

import { randomUUID } from 'node:crypto';

import { sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import type { WalletDb } from '@/lib/game/wallet';
import { walletAdd } from '@/lib/game/wallet';

import {
  HALLOWEEN_ACCRUE_END_MS,
  HALLOWEEN_CLAIM_END_MS,
  CANDY_EXCHANGE,
  CANDY_EXCHANGE_MAX_PER_ACTION,
  CANDY_LADDER,
  halloweenPhase,
  type CandyExchangeKind,
} from './config';

/**
 * 할로윈 사탕 — 강화 성공 적립·도달 보상 수령(칭호 단계 포함)·교환(lib/game/halloween/config.ts의 규칙). 추석 송편과 같은 뼈대.
 * 원장(halloween_candy_ledger)이 정본, 지갑(halloween_candy)은 캐시 — 항상 같은 트랜잭션에서 갱신.
 */

type Dbx = Pick<typeof db, 'execute'>;
/** 호출부가 트랜잭션을 넘길 수 있게(테스트는 롤백 tx) — 기본은 전역 db. 안에서 (중첩) 트랜잭션을 연다. */
type DbLike = WalletDb;

/**
 * 강화 성공 적립 — 수령 사후처리(applyEnhancePostEffects)에서 호출. 같은 잡은 한 번만(ref).
 * `at`은 강화 수령 시각(서버 시계) — 적립 마감 뒤 수령은 0. 반환 = 적립된 사탕(0이면 미적립).
 */
export async function accrueCandy(
  p: { userId: string; serverId: number; jobId: bigint | number | string; level: number; at?: Date },
  dbx: DbLike = db,
): Promise<number> {
  const pts = Math.floor(p.level);
  if (!Number.isFinite(pts) || pts <= 0) return 0;
  const at = p.at ?? new Date();
  if (halloweenPhase(at) !== 'accrue') return 0;
  const ref = `job:${String(p.jobId)}`;
  return dbx.transaction(async (tx) => {
    const r = (await tx.execute(sql`
      insert into halloween_candy_ledger (user_id, server_id, kind, delta, note, ref, created_at)
      values (${p.userId}::uuid, ${p.serverId}, 'earn', ${pts}, ${`강화 성공 +${pts}`}, ${ref}, ${at.toISOString()})
      on conflict (ref) where ref is not null do nothing
      returning id
    `)) as unknown as { id: string }[];
    if (r.length === 0) return 0;
    await tx.execute(sql`
      insert into halloween_candy (user_id, server_id, total, spent, updated_at)
      values (${p.userId}::uuid, ${p.serverId}, ${pts}, 0, now())
      on conflict (user_id, server_id) do update
        set total = halloween_candy.total + ${pts}, updated_at = now()
    `);
    return pts;
  });
}

export type CandyOverview = {
  phase: ReturnType<typeof halloweenPhase>;
  total: number;
  spent: number;
  available: number;
  /** 받은 단계 번호. */
  claimed: number[];
  /** 지금 받을 수 있는 단계 수(누적 도달 & 미수령). */
  claimable: number;
  accrueEndMs: number;
  claimEndMs: number;
};

/** 화면용 요약 — 지갑 1행 + 수령 목록 1쿼리. */
export async function getCandyOverview(userId: string, serverId: number, at = new Date(), dbx: DbLike = db): Promise<CandyOverview> {
  const [row] = (await dbx.execute(sql`
    select coalesce(w.total, 0)::text as total, coalesce(w.spent, 0)::text as spent,
           coalesce((select json_agg(step order by step) from halloween_candy_claims c
                      where c.user_id = ${userId}::uuid and c.server_id = ${serverId}), '[]'::json) as claimed
      from (select 1) x
      left join halloween_candy w on w.user_id = ${userId}::uuid and w.server_id = ${serverId}
  `)) as unknown as { total: string; spent: string; claimed: number[] }[];
  const total = Number(row?.total ?? 0);
  const spent = Number(row?.spent ?? 0);
  const claimed = (row?.claimed ?? []).map(Number);
  const claimedSet = new Set(claimed);
  const claimable = CANDY_LADDER.filter((l) => total >= l.at && !claimedSet.has(l.step)).length;
  return {
    phase: halloweenPhase(at),
    total,
    spent,
    available: total - spent,
    claimed,
    claimable,
    accrueEndMs: HALLOWEEN_ACCRUE_END_MS,
    claimEndMs: HALLOWEEN_CLAIM_END_MS,
  };
}

/** 홈 배너용 — 받을 수 있는 단계가 있는지만(가벼운 1쿼리). */
export async function countClaimableCandy(userId: string, serverId: number): Promise<number> {
  const o = await getCandyOverview(userId, serverId);
  return o.phase === 'accrue' || o.phase === 'claim' ? o.claimable : 0;
}

async function grantBoxes(tx: Dbx, userId: string, serverId: number, boxes: number): Promise<void> {
  const per = boxes / 3;
  for (const slot of ['weapon', 'armor', 'accessory'] as const) {
    await tx.execute(sql`
      insert into user_supply_boxes (user_id, server_id, slot, count)
      values (${userId}::uuid, ${serverId}, ${slot}, ${per})
      on conflict (user_id, server_id, slot) do update set count = user_supply_boxes.count + ${per}
    `);
  }
}

export type ClaimStepResult =
  | { ok: true; step: number; diamond: number; boxes: number; title: string | null }
  | { ok: false; reason: 'CLOSED' | 'UNKNOWN_STEP' | 'NOT_REACHED' | 'ALREADY' };

/**
 * 도달 보상 수령 — 단일 트랜잭션: 국면 확인 → 누적 재검증(서버 권위) → claims insert(PK 멱등) → 지급.
 * 지갑 행을 잠가 같은 순간의 교환·적립과 직렬화한다.
 */
export async function claimCandyStep(userId: string, serverId: number, step: number, at = new Date(), dbx: DbLike = db): Promise<ClaimStepResult> {
  const phase = halloweenPhase(at);
  if (phase !== 'accrue' && phase !== 'claim') return { ok: false, reason: 'CLOSED' };
  const def = CANDY_LADDER.find((l) => l.step === step);
  if (!def) return { ok: false, reason: 'UNKNOWN_STEP' };
  return dbx.transaction(async (tx) => {
    const [w] = (await tx.execute(sql`
      select total::text as total from halloween_candy
       where user_id = ${userId}::uuid and server_id = ${serverId} for update
    `)) as unknown as { total: string }[];
    if (Number(w?.total ?? 0) < def.at) return { ok: false as const, reason: 'NOT_REACHED' as const };
    const ins = (await tx.execute(sql`
      insert into halloween_candy_claims (user_id, server_id, step, diamond, boxes)
      values (${userId}::uuid, ${serverId}, ${def.step}, ${def.diamond}, ${def.boxes})
      on conflict (user_id, server_id, step) do nothing
      returning step
    `)) as unknown as { step: number }[];
    if (ins.length === 0) return { ok: false as const, reason: 'ALREADY' as const };
    await walletAdd(tx, userId, serverId, def.diamond, 'halloween_ladder', `step:${def.step}`);
    await grantBoxes(tx, userId, serverId, def.boxes);
    // 칭호 단계(6만·15만) — 같은 트랜잭션에서 지급(user_titles PK 멱등, 2026-10-20 확정: 칭호를 도달 보상으로).
    if (def.title) {
      await tx.execute(sql`
        insert into user_titles (user_id, server_id, title_code)
        values (${userId}::uuid, ${serverId}, ${def.title})
        on conflict (user_id, server_id, title_code) do nothing
      `);
    }
    return { ok: true as const, step: def.step, diamond: def.diamond, boxes: def.boxes, title: def.title ?? null };
  });
}

export type ExchangeResult =
  | { ok: true; kind: CandyExchangeKind; count: number; cost: number; diamond: number; boxes: number; available: number }
  | { ok: false; reason: 'CLOSED' | 'BAD_COUNT' | 'INSUFFICIENT' };

/**
 * 교환 — 단일 트랜잭션: 국면 확인 → 지갑 잠금 → 사용 가능 재검증 → spent 증가 + 원장(−) → 지급.
 * count는 1~CANDY_EXCHANGE_MAX_PER_ACTION(한도가 아니라 실수 방지).
 */
export async function exchangeCandy(
  userId: string,
  serverId: number,
  kind: CandyExchangeKind,
  count: number,
  at = new Date(),
  dbx: DbLike = db,
): Promise<ExchangeResult> {
  const phase = halloweenPhase(at);
  if (phase !== 'accrue' && phase !== 'claim') return { ok: false, reason: 'CLOSED' };
  if (!Number.isInteger(count) || count < 1 || count > CANDY_EXCHANGE_MAX_PER_ACTION) return { ok: false, reason: 'BAD_COUNT' };
  const def = CANDY_EXCHANGE[kind];
  const cost = def.candy * count;
  const diamond = kind === 'diamond' ? CANDY_EXCHANGE.diamond.diamond * count : 0;
  const boxes = kind === 'box' ? CANDY_EXCHANGE.box.boxes * count : 0;
  return dbx.transaction(async (tx) => {
    const [w] = (await tx.execute(sql`
      select total::text as total, spent::text as spent from halloween_candy
       where user_id = ${userId}::uuid and server_id = ${serverId} for update
    `)) as unknown as { total: string; spent: string }[];
    const available = Number(w?.total ?? 0) - Number(w?.spent ?? 0);
    if (available < cost) return { ok: false as const, reason: 'INSUFFICIENT' as const };
    await tx.execute(sql`
      update halloween_candy set spent = spent + ${cost}, updated_at = now()
       where user_id = ${userId}::uuid and server_id = ${serverId}
    `);
    const ref = `ex:${randomUUID()}`;
    await tx.execute(sql`
      insert into halloween_candy_ledger (user_id, server_id, kind, delta, note, ref, created_at)
      values (${userId}::uuid, ${serverId}, 'exchange', ${-cost},
              ${kind === 'diamond' ? `💎${diamond} 교환` : `📦${boxes} 교환`}, ${ref}, ${at.toISOString()})
    `);
    if (diamond > 0) await walletAdd(tx, userId, serverId, diamond, 'halloween_exchange', ref);
    if (boxes > 0) await grantBoxes(tx, userId, serverId, boxes);
    return { ok: true as const, kind, count, cost, diamond, boxes, available: available - cost };
  });
}
