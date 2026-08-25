import 'server-only';

import { sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { isUniqueViolation } from '@/lib/db/errors';
import { kstDateString } from '@/lib/kst';
import { walletAdd, walletTrySpend } from '@/lib/game/wallet';
import {
  EXPEDITION_DAILY_STARTS,
  EXPEDITION_CRIT_BP,
  EXPEDITION_REFRESH_COST,
  EXPEDITION_REFRESH_FREE_PER_DAY,
  EXPEDITION_SLOT_UNLOCKS,
  GEM_TO_MS,
} from '@/lib/game/balance';
import {
  applyCrit,
  applyExpeditionXp,
  applyMultiplier,
  cryptoRng10k,
  effectiveSlots,
  levelBonusBp,
  rollMission,
  synergyBpForSnapshot,
  type ExpeditionReward,
  type Rng10k,
} from './engine';

/**
 * 파견 트랜잭션 서비스(EXPEDITION.md A′) — 관례(1파일 1액션)와 달리 한 파일에 모은 이유:
 * 모든 액션이 expedition_state 잠금·KST 카운터·오퍼 행 조건부 전이라는 같은 골격을 공유하고,
 * 정합의 핵심이 파일 간이 아니라 "한 tx 안의 순서"에 있어서다(강화 §6 원칙 준수).
 *
 * 불변식(스키마 0172와 쌍):
 *  - 슬롯당 활성(offer|running) 1행 — expeditions_one_active
 *  - 파견 중 아바타는 1곳 — expeditions_avatar_busy(23505 → AVATAR_BUSY)
 *  - 보상은 오퍼 롤로 사전 확정, 시작 시 배율 스냅샷(final_reward), 수령은 지급+대성공 판정만
 */

export type ExpeditionErrorCode =
  | 'NO_OFFER'
  | 'NOT_RUNNING'
  | 'NOT_READY'
  | 'AVATAR_NOT_FOUND'
  | 'AVATAR_BUSY'
  | 'START_LIMIT'
  | 'SLOT_LOCKED'
  | 'SLOT_ALREADY_OPEN'
  | 'INSUFFICIENT_DIAMOND';
export class ExpeditionError extends Error {
  constructor(public code: ExpeditionErrorCode) {
    super(code);
  }
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

type StateRow = {
  level: number;
  xp: string; // bigint::text
  slots_purchased: number;
  starts_kst_day: string | null;
  starts_today: number;
  refresh_kst_day: string | null;
  refresh_today: number;
};

/** 상태 행 upsert 후 잠금 — 모든 액션의 첫 걸음(카운터·레벨 정합의 축). */
async function lockState(tx: Tx, userId: string, serverId: number): Promise<StateRow> {
  await tx.execute(sql`
    insert into expedition_state (user_id, server_id) values (${userId}::uuid, ${serverId})
    on conflict (user_id, server_id) do nothing
  `);
  const [st] = (await tx.execute(sql`
    select level, xp::text, slots_purchased, starts_kst_day::text, starts_today,
           refresh_kst_day::text, refresh_today
    from expedition_state where user_id = ${userId}::uuid and server_id = ${serverId}
    for update
  `)) as unknown as StateRow[];
  return st!;
}

/** KST 일일 카운터 — 날짜가 다르면 0으로 본다(갱신은 호출부가 today와 함께 수행). */
const todayCount = (day: string | null, count: number, today: string) =>
  day === today ? count : 0;

/**
 * 오퍼 보정(lazy) — 화면 진입 시 호출: 실효 슬롯마다 활성 행이 없으면 롤해서 채우고,
 * 자정이 지난 offer는 재롤(전체 교체). running/claimed는 건드리지 않는다. 멱등.
 */
export function ensureOffers(userId: string, serverId: number, rng: Rng10k = cryptoRng10k) {
  return db.transaction(async (tx) => {
    const st = await lockState(tx, userId, serverId);
    const slots = effectiveSlots(st.level, st.slots_purchased);
    const today = kstDateString();
    const active = (await tx.execute(sql`
      select id::text, slot, status, (rolled_at at time zone 'Asia/Seoul')::date::text as rolled_kst
      from expeditions
      where user_id = ${userId}::uuid and server_id = ${serverId} and status in ('offer','running')
      for update
    `)) as unknown as { id: string; slot: number; status: string; rolled_kst: string }[];

    for (let slot = 1; slot <= slots; slot++) {
      const row = active.find((r) => r.slot === slot);
      if (!row) {
        const m = rollMission(rng, st.level);
        // 경합 안전 — 부분 유니크(one_active)와 do nothing: 동시 진입 시 한쪽만 삽입된다.
        await tx.execute(sql`
          insert into expeditions (user_id, server_id, slot, region, difficulty, duration_ms, reward)
          values (${userId}::uuid, ${serverId}, ${slot}, ${m.region}, ${m.difficulty}, ${m.durationMs}, ${JSON.stringify(m.reward)}::jsonb)
          on conflict do nothing
        `);
      } else if (row.status === 'offer' && row.rolled_kst !== today) {
        // 자정 전체 교체 — 미배정 오퍼만.
        const m = rollMission(rng, st.level);
        await tx.execute(sql`
          update expeditions set region = ${m.region}, difficulty = ${m.difficulty},
                 duration_ms = ${m.durationMs}, reward = ${JSON.stringify(m.reward)}::jsonb, rolled_at = now()
          where id = ${BigInt(row.id)} and status = 'offer'
        `);
      }
    }
  });
}

/** 새로고침 — 무료 3회/일 소진 후 💎20. offer 상태 슬롯만. 반환: 남은 무료 횟수. */
export function refreshOffer(
  userId: string,
  serverId: number,
  slot: number,
  rng: Rng10k = cryptoRng10k,
): Promise<{ freeLeft: number }> {
  return db.transaction(async (tx) => {
    const st = await lockState(tx, userId, serverId);
    const today = kstDateString();
    const used = todayCount(st.refresh_kst_day, st.refresh_today, today);

    const [offer] = (await tx.execute(sql`
      select id::text from expeditions
      where user_id = ${userId}::uuid and server_id = ${serverId} and slot = ${slot} and status = 'offer'
      for update
    `)) as unknown as { id: string }[];
    if (!offer) throw new ExpeditionError('NO_OFFER');

    if (used < EXPEDITION_REFRESH_FREE_PER_DAY) {
      await tx.execute(sql`
        update expedition_state set refresh_kst_day = ${today}, refresh_today = ${used + 1}
        where user_id = ${userId}::uuid and server_id = ${serverId}
      `);
    } else {
      const paid = await walletTrySpend(tx, userId, serverId, EXPEDITION_REFRESH_COST, 'expedition_refresh');
      if (!paid) throw new ExpeditionError('INSUFFICIENT_DIAMOND');
    }

    const m = rollMission(rng, st.level);
    await tx.execute(sql`
      update expeditions set region = ${m.region}, difficulty = ${m.difficulty},
             duration_ms = ${m.durationMs}, reward = ${JSON.stringify(m.reward)}::jsonb, rolled_at = now()
      where id = ${BigInt(offer.id)} and status = 'offer'
    `);
    const usedAfter = used < EXPEDITION_REFRESH_FREE_PER_DAY ? used + 1 : used;
    return { freeLeft: Math.max(0, EXPEDITION_REFRESH_FREE_PER_DAY - usedAfter) };
  });
}

/**
 * 파견 시작 — 아바타 배정 + 배율 스냅샷 + 서버 시계 stamping.
 * 일일 시작 6회는 여기서 차감(취소 미반환 — 사용자 확정).
 */
export function startExpedition(
  userId: string,
  serverId: number,
  slot: number,
  avatarProfileId: string,
): Promise<{ completeAtIso: string; finalReward: ExpeditionReward; synergyBp: number }> {
  return db.transaction(async (tx) => {
    const st = await lockState(tx, userId, serverId);
    const today = kstDateString();
    const starts = todayCount(st.starts_kst_day, st.starts_today, today);
    if (starts >= EXPEDITION_DAILY_STARTS) throw new ExpeditionError('START_LIMIT');

    const [offer] = (await tx.execute(sql`
      select id::text, region, duration_ms::text, reward from expeditions
      where user_id = ${userId}::uuid and server_id = ${serverId} and slot = ${slot} and status = 'offer'
      for update
    `)) as unknown as { id: string; region: string; duration_ms: string; reward: ExpeditionReward }[];
    if (!offer) throw new ExpeditionError('NO_OFFER');

    // 아바타 소유 검증 + 장비 스냅샷(시너지 재료). 기본 아바타(isDefault)도 허용(시너지 0).
    const [av] = (await tx.execute(sql`
      select equipment_snapshot from user_profiles
      where id = ${avatarProfileId}::uuid and user_id = ${userId}::uuid and server_id = ${serverId}
    `)) as unknown as { equipment_snapshot: unknown }[];
    if (!av) throw new ExpeditionError('AVATAR_NOT_FOUND');

    const synergy = synergyBpForSnapshot(av.equipment_snapshot, offer.region as never);
    const lvBonus = levelBonusBp(st.level);
    const finalReward = applyMultiplier(offer.reward, synergy + lvBonus);

    // 카운터 선차감(같은 tx — 실패 시 롤백으로 원복).
    await tx.execute(sql`
      update expedition_state set starts_kst_day = ${today}, starts_today = ${starts + 1}
      where user_id = ${userId}::uuid and server_id = ${serverId}
    `);

    let completeAtIso: string;
    try {
      const [row] = (await tx.execute(sql`
        update expeditions
        set status = 'running', avatar_profile_id = ${avatarProfileId}::uuid,
            synergy_bp = ${synergy}, level_bonus_bp = ${lvBonus},
            final_reward = ${JSON.stringify(finalReward)}::jsonb,
            started_at = now(),
            complete_at = now() + (duration_ms || ' milliseconds')::interval
        where id = ${BigInt(offer.id)} and status = 'offer'
        returning complete_at
      `)) as unknown as { complete_at: string | Date }[];
      if (!row) throw new ExpeditionError('NO_OFFER'); // 경합으로 이미 전이됨
      completeAtIso = new Date(row.complete_at).toISOString();
    } catch (e) {
      // 부분 유니크 expeditions_avatar_busy 위반 — 같은 아바타 동시 파견.
      // Drizzle이 PostgresError를 cause로 감싸므로 체인 검사 헬퍼 사용(첫 테스트에서 적발).
      if (isUniqueViolation(e)) throw new ExpeditionError('AVATAR_BUSY');
      throw e;
    }
    return { completeAtIso, finalReward, synergyBp: synergy };
  });
}

/** 취소 — running → cancelled. 보상 없음·일일 횟수 미반환(사용자 확정). */
export function cancelExpedition(userId: string, serverId: number, slot: number): Promise<void> {
  return db.transaction(async (tx) => {
    const res = (await tx.execute(sql`
      update expeditions set status = 'cancelled'
      where user_id = ${userId}::uuid and server_id = ${serverId} and slot = ${slot} and status = 'running'
      returning id
    `)) as unknown as unknown[];
    if (res.length === 0) throw new ExpeditionError('NOT_RUNNING');
  });
}

/** 즉시 완료 — 남은 시간 전량 다이아 환산(강화와 동일 GEM_TO_MS, 원장 미기록 사유). */
export function completeNowExpedition(
  userId: string,
  serverId: number,
  slot: number,
): Promise<{ cost: number }> {
  return db.transaction(async (tx) => {
    const [row] = (await tx.execute(sql`
      select id::text, greatest(0, extract(epoch from (complete_at - now())) * 1000)::bigint::text as remain_ms
      from expeditions
      where user_id = ${userId}::uuid and server_id = ${serverId} and slot = ${slot} and status = 'running'
      for update
    `)) as unknown as { id: string; remain_ms: string }[];
    if (!row) throw new ExpeditionError('NOT_RUNNING');
    const remain = Number(row.remain_ms);
    const cost = remain <= 0 ? 0 : Math.max(1, Math.ceil(remain / GEM_TO_MS));
    if (cost > 0) {
      const paid = await walletTrySpend(tx, userId, serverId, cost, 'expedition_reduce');
      if (!paid) throw new ExpeditionError('INSUFFICIENT_DIAMOND');
      await tx.execute(sql`
        update expeditions set complete_at = now(), reduced_ms = reduced_ms + ${remain}
        where id = ${BigInt(row.id)} and status = 'running'
      `);
    }
    return { cost };
  });
}

export type ClaimResult = {
  reward: ExpeditionReward;
  crit: boolean;
  xpGained: number;
  level: number;
  levelUp: boolean;
};

/**
 * 수령 — 시계 검증(§6.3) → 대성공 판정(여기가 유일한 수령 RNG) → 지급 + XP → claimed.
 * 지급·전이·레벨업이 한 tx(§3.3). 멱등: 조건부 전이(running→claimed)가 이중 지급을 막는다.
 */
export function claimExpedition(
  userId: string,
  serverId: number,
  slot: number,
  rng: Rng10k = cryptoRng10k,
): Promise<ClaimResult> {
  return db.transaction(async (tx) => {
    const st = await lockState(tx, userId, serverId);
    const [row] = (await tx.execute(sql`
      select id::text, duration_ms::text, final_reward, complete_at <= now() as ready
      from expeditions
      where user_id = ${userId}::uuid and server_id = ${serverId} and slot = ${slot} and status = 'running'
      for update
    `)) as unknown as { id: string; duration_ms: string; final_reward: ExpeditionReward; ready: boolean }[];
    if (!row) throw new ExpeditionError('NOT_RUNNING');
    if (!row.ready) throw new ExpeditionError('NOT_READY');

    const crit = rng() < EXPEDITION_CRIT_BP;
    const reward = crit ? applyCrit(row.final_reward) : row.final_reward;

    // 조건부 전이 먼저 — 0행이면 다른 요청이 이미 수령(지급 없이 종료).
    const transitioned = (await tx.execute(sql`
      update expeditions set status = 'claimed', crit = ${crit}, claimed_at = now()
      where id = ${BigInt(row.id)} and status = 'running'
      returning id
    `)) as unknown as unknown[];
    if (transitioned.length === 0) throw new ExpeditionError('NOT_RUNNING');

    if (reward.diamond && reward.diamond > 0) {
      await walletAdd(tx, userId, serverId, reward.diamond, 'expedition', `exp:${row.id}`);
    }
    if (reward.boxes) {
      for (const slotKey of ['weapon', 'armor', 'accessory'] as const) {
        const n = reward.boxes[slotKey];
        if (n > 0) {
          await tx.execute(sql`
            insert into user_supply_boxes (user_id, server_id, slot, count)
            values (${userId}::uuid, ${serverId}, ${slotKey}, ${n})
            on conflict (user_id, server_id, slot) do update set count = user_supply_boxes.count + ${n}
          `);
        }
      }
    }

    const xpGained = Math.round(Number(row.duration_ms) / 3_600_000);
    const next = applyExpeditionXp(st.level, BigInt(st.xp), xpGained);
    await tx.execute(sql`
      update expedition_state set level = ${next.level}, xp = ${next.xp}
      where user_id = ${userId}::uuid and server_id = ${serverId}
    `);

    return { reward, crit, xpGained, level: next.level, levelUp: next.level > st.level };
  });
}

/** 슬롯 다이아 선구매 — 레벨 무료 해금 전에 여는 sink. */
export function purchaseSlot(userId: string, serverId: number, slot: number): Promise<void> {
  return db.transaction(async (tx) => {
    const st = await lockState(tx, userId, serverId);
    const def = EXPEDITION_SLOT_UNLOCKS.find((u) => u.slot === slot);
    if (!def) throw new ExpeditionError('SLOT_LOCKED');
    if (effectiveSlots(st.level, st.slots_purchased) >= slot) throw new ExpeditionError('SLOT_ALREADY_OPEN');
    // 순서 강제 — 슬롯3을 먼저 살 수 없다(2를 이미 확보했어야).
    if (slot === 3 && effectiveSlots(st.level, st.slots_purchased) < 2) throw new ExpeditionError('SLOT_LOCKED');
    const paid = await walletTrySpend(tx, userId, serverId, def.diamond, 'expedition_slot');
    if (!paid) throw new ExpeditionError('INSUFFICIENT_DIAMOND');
    await tx.execute(sql`
      update expedition_state set slots_purchased = greatest(slots_purchased, ${slot})
      where user_id = ${userId}::uuid and server_id = ${serverId}
    `);
  });
}
