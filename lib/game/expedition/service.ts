import 'server-only';

import { sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { isUniqueViolation } from '@/lib/db/errors';
import { kstDateString } from '@/lib/kst';
import { walletAdd, walletTrySpend } from '@/lib/game/wallet';
import { markChallengeEvent } from '@/lib/game/challenges/events';
import {
  EXPEDITION_REFRESH_COST,
  EXPEDITION_DURATIONS_H,
  expeditionXpForHours,
  EXPEDITION_REFRESH_FREE_PER_DAY,
} from '@/lib/game/balance';
import {
  applyCrit,
  applyExpeditionXp,
  applyMultiplier,
  cryptoRng10k,
  effectiveSlots,
  critBp,
  asBonusBp,
  avatarEnhanceSum,
  rollMission,
  avatarWeightedSum,
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
  | 'SLOT_LOCKED'
  | 'DAILY_LIMIT'
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

/**
 * 아바타 강화 합(§3.3) — 보유 아바타별 AS(생성 스냅샷 3종의 현재 enhance_level 합)와 최댓값(안내용).
 * 시작 시 배율 산출이 board 조회와 같은 산식을 쓰도록 한 곳에서 계산한다. 기본 아바타·미보유 key는 0.
 */
async function loadAvatarSums(
  tx: Tx,
  userId: string,
  serverId: number,
): Promise<{ byId: Map<string, number>; base: number; levelByKey: Map<string, number> }> {
  const [avs, lv] = await Promise.all([
    tx.execute(sql`
      select id::text, equipment_snapshot from user_profiles
      where user_id = ${userId}::uuid and server_id = ${serverId}
    `) as unknown as Promise<{ id: string; equipment_snapshot: unknown }[]>,
    tx.execute(sql`
      select ci.code as key, ue.enhance_level as lv
      from user_equipment ue join catalog_items ci on ci.id = ue.catalog_item_id
      where ue.user_id = ${userId}::uuid and ue.server_id = ${serverId}
    `) as unknown as Promise<{ key: string; lv: number }[]>,
  ]);
  const levelByKey = new Map(lv.map((r) => [r.key, Number(r.lv)]));
  const byId = new Map<string, number>();
  let base = 0;
  for (const a of avs) {
    const sum = avatarEnhanceSum(a.equipment_snapshot, levelByKey);
    byId.set(a.id, sum);
    if (sum > base) base = sum;
  }
  return { byId, base, levelByKey };
}

/** 계정 합산 강화 — 보유 장비 enhance_level 합(리더보드 'sum'과 동일 정의). 슬롯 해금 원천. */
export async function enhanceSumOf(tx: Tx, userId: string, serverId: number): Promise<number> {
  const [r] = (await tx.execute(sql`
    select coalesce(sum(enhance_level), 0)::int as s from user_equipment
    where user_id = ${userId}::uuid and server_id = ${serverId}
  `)) as unknown as { s: number }[];
  return Number(r?.s ?? 0);
}

export function ensureOffers(userId: string, serverId: number, rng: Rng10k = cryptoRng10k) {
  return db.transaction(async (tx) => {
    const st = await lockState(tx, userId, serverId);
    // 열린 슬롯에만 오퍼를 채운다. 합산 강화 하락으로 닫힌 슬롯의 진행 중 파견은 건드리지 않는다(수령까지 유지).
    const slots = effectiveSlots(await enhanceSumOf(tx, userId, serverId));
    const today = kstDateString();
    const active = (await tx.execute(sql`
      select id::text, slot, status, (rolled_at at time zone 'Asia/Seoul')::date::text as rolled_kst, duration_ms::text
      from expeditions
      where user_id = ${userId}::uuid and server_id = ${serverId} and status in ('offer','running')
      for update
    `)) as unknown as { id: string; slot: number; status: string; rolled_kst: string; duration_ms: string }[];
    // 시간표 개정(2026-09-01 4/8/12/24→2/4/8/12) 자가 치유 — 옛 시간의 미배정 오퍼는 날짜와 무관하게 즉시 리롤
    // (구 스케일 보상이 하루 동안 섞여 보이는 것 방지). 진행 중(running) 24h 파견은 건드리지 않는다.
    const allowedMs = new Set(EXPEDITION_DURATIONS_H.map((h) => h * 3_600_000));
    const staleOffer = (r: { status: string; rolled_kst: string; duration_ms: string }) =>
      r.status === 'offer' && (r.rolled_kst !== today || !allowedMs.has(Number(r.duration_ms)));

    // 슬롯당 하루 1회(2026-09-01): 오늘(KST) 이미 출발한 슬롯은 자정까지 새 오퍼를 채우지 않는다 —
    // 수령한 카드가 "오늘 완료"로 남고, 자정 이후 첫 진입에서 오퍼가 생긴다. 어제 출발해 오늘 수령한 건은 대상 아님.
    const startedToday = new Set(
      ((await tx.execute(sql`
        select distinct slot from expeditions
        where user_id = ${userId}::uuid and server_id = ${serverId}
          and started_at is not null and (started_at at time zone 'Asia/Seoul')::date = ${today}::date
      `)) as unknown as { slot: number }[]).map((r) => Number(r.slot)),
    );
    for (let slot = 1; slot <= slots; slot++) {
      const row = active.find((r) => r.slot === slot);
      if (startedToday.has(slot)) {
        // 오늘 이미 출발한 슬롯 — 남아 있는 미배정 오퍼는 치운다(구 로직이 수령 직후 만든 오퍼·오늘 새로고침분).
        // 안 치우면 오퍼 카드가 보이는데 출발은 DAILY_LIMIT로 막히는 모순(2026-08-31 스테이징 발견). 수령 카드가 '오늘 완료'로 뜬다.
        if (row?.status === 'offer') {
          await tx.execute(sql`delete from expeditions where id = ${BigInt(row.id)} and status = 'offer'`);
        }
        continue;
      }
      if (!row) {
        const m = rollMission(rng, st.level);
        // 경합 안전 — 부분 유니크(one_active)와 do nothing: 동시 진입 시 한쪽만 삽입된다.
        await tx.execute(sql`
          insert into expeditions (user_id, server_id, slot, region, difficulty, duration_ms, reward)
          values (${userId}::uuid, ${serverId}, ${slot}, ${m.region}, ${m.difficulty}, ${m.durationMs}, ${JSON.stringify(m.reward)}::jsonb)
          on conflict do nothing
        `);
      } else if (staleOffer(row)) {
        // 자정 전체 교체(+옛 시간표 오퍼 즉시 교체) — 미배정 오퍼만.
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

/**
 * 전체 새로고침(2026-08-28 기획 변경) — 미배정(offer) 슬롯을 **한 번에** 리롤. 횟수 1회 차감(무료 3회/일 소진 후 💎20).
 * 진행 중(running) 슬롯은 건드리지 않는다. offer 슬롯이 0개면 NO_OFFER.
 */
export function refreshAllOffers(userId: string, serverId: number, rng: Rng10k = cryptoRng10k): Promise<{ freeLeft: number; rerolled: number }> {
  return db.transaction(async (tx) => {
    const st = await lockState(tx, userId, serverId);
    const today = kstDateString();
    const used = todayCount(st.refresh_kst_day, st.refresh_today, today);
    const offers = (await tx.execute(sql`
      select id::text from expeditions
      where user_id = ${userId}::uuid and server_id = ${serverId} and status = 'offer'
      order by slot for update
    `)) as unknown as { id: string }[];
    if (offers.length === 0) throw new ExpeditionError('NO_OFFER');
    if (used < EXPEDITION_REFRESH_FREE_PER_DAY) {
      await tx.execute(sql`
        update expedition_state set refresh_kst_day = ${today}, refresh_today = ${used + 1}
        where user_id = ${userId}::uuid and server_id = ${serverId}
      `);
    } else {
      const paid = await walletTrySpend(tx, userId, serverId, EXPEDITION_REFRESH_COST, 'expedition_refresh');
      if (!paid) throw new ExpeditionError('INSUFFICIENT_DIAMOND');
    }
    for (const o of offers) {
      const m = rollMission(rng, st.level);
      await tx.execute(sql`
        update expeditions set region = ${m.region}, difficulty = ${m.difficulty},
               duration_ms = ${m.durationMs}, reward = ${JSON.stringify(m.reward)}::jsonb, rolled_at = now()
        where id = ${BigInt(o.id)} and status = 'offer'
      `);
    }
    await markChallengeEvent(tx, userId, serverId, 'exp_refresh'); // 도전과제 '파견 새로고침 하기'(이벤트형)
    const usedAfter = used < EXPEDITION_REFRESH_FREE_PER_DAY ? used + 1 : used;
    return { freeLeft: Math.max(0, EXPEDITION_REFRESH_FREE_PER_DAY - usedAfter), rerolled: offers.length };
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
    await markChallengeEvent(tx, userId, serverId, 'exp_refresh'); // 도전과제 '파견 새로고침 하기'(이벤트형)
    const usedAfter = used < EXPEDITION_REFRESH_FREE_PER_DAY ? used + 1 : used;
    return { freeLeft: Math.max(0, EXPEDITION_REFRESH_FREE_PER_DAY - usedAfter) };
  });
}

/**
 * 파견 시작 — 아바타 배정 + 배율 스냅샷 + 서버 시계 stamping.
 * 일일 시작 상한 없음(2026-08-28) — 처리량은 슬롯 수(합산 강화 해금)만이 제한한다.
 */
export function startExpedition(
  userId: string,
  serverId: number,
  slot: number,
  avatarProfileId: string,
): Promise<{ completeAtIso: string; finalReward: ExpeditionReward; synergyBp: number; reqBonusBp: number }> {
  return db.transaction(async (tx) => {
    await lockState(tx, userId, serverId); // 유저×서버 직렬화(동시 시작 경합 방지)
    // 새 배정 게이트 — 합산 강화가 문턱 아래로 내려가면 그 슬롯은 새로 못 보낸다(진행분은 별도).
    if (slot > effectiveSlots(await enhanceSumOf(tx, userId, serverId))) throw new ExpeditionError('SLOT_LOCKED');
    // 슬롯당 하루 1회(2026-09-01, 투표 26:12) — 판정은 **출발 시각**(KST 일자). 수령은 언제든.
    const [dup] = (await tx.execute(sql`
      select 1 from expeditions
      where user_id = ${userId}::uuid and server_id = ${serverId} and slot = ${slot}
        and started_at is not null and (started_at at time zone 'Asia/Seoul')::date = (now() at time zone 'Asia/Seoul')::date
      limit 1
    `)) as unknown as unknown[];
    if (dup) throw new ExpeditionError('DAILY_LIMIT');

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

    // 아바타 강화 합(§3.3) + 지역 시너지(§3.2, 2026-08-28 가중 방식) — 장비 강화 레벨에 일치 ×1.3/일반 ×1.15를
    // 곱한 가중 합(WS)으로 M(WS) 배율 하나만 적용. 시작 시점 스냅샷(진행 중 하락은 무관).
    // synergy_bp 컬럼은 "가중으로 늘어난 배율분"(표시·이력용) = M(WS) − M(AS).
    const { byId, levelByKey } = await loadAvatarSums(tx, userId, serverId);
    const avatarSum = byId.get(avatarProfileId) ?? 0;
    const weighted = avatarWeightedSum(av.equipment_snapshot, levelByKey, offer.region as never);
    const reqBonus = asBonusBp(weighted);
    const synergy = Math.max(0, reqBonus - asBonusBp(avatarSum));
    // 레벨 배율 없음(2026-08-27) — level_bonus_bp는 0 고정(컬럼은 이력 호환으로 유지).
    const finalReward = applyMultiplier(offer.reward, reqBonus);

    let completeAtIso: string;
    try {
      const [row] = (await tx.execute(sql`
        update expeditions
        set status = 'running', avatar_profile_id = ${avatarProfileId}::uuid,
            synergy_bp = ${synergy}, level_bonus_bp = 0, req_bonus_bp = ${reqBonus},
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
    return { completeAtIso, finalReward, synergyBp: synergy, reqBonusBp: reqBonus };
  });
}

/**
 * 취소 — running → cancelled. 보상 없음·일일 횟수 미반환(사용자 확정).
 * 완료(귀환) 후에는 취소 불가(적대 검수 5) — 확정 보상을 실수로 태우는
 * 자해 경로 차단(UI는 이미 숨기지만 클라 시계 오차·직접 호출 방어).
 */
export function cancelExpedition(userId: string, serverId: number, slot: number): Promise<void> {
  return db.transaction(async (tx) => {
    const res = (await tx.execute(sql`
      update expeditions set status = 'cancelled'
      where user_id = ${userId}::uuid and server_id = ${serverId} and slot = ${slot}
        and status = 'running' and complete_at > now()
      returning id
    `)) as unknown as unknown[];
    if (res.length === 0) throw new ExpeditionError('NOT_RUNNING');
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
      select id::text, region, duration_ms::text, final_reward, complete_at <= now() as ready
      from expeditions
      where user_id = ${userId}::uuid and server_id = ${serverId} and slot = ${slot} and status = 'running'
      for update
    `)) as unknown as { id: string; region: string; duration_ms: string; final_reward: ExpeditionReward; ready: boolean }[];
    if (!row) throw new ExpeditionError('NOT_RUNNING');
    if (!row.ready) throw new ExpeditionError('NOT_READY');

    const crit = rng() < critBp(st.level, await enhanceSumOf(tx, userId, serverId)); // 기본 5% + 레벨 0.1%p/lv + 합산 1,000당 1%p(상한 15%p)
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

    const xpGained = row.final_reward.xp ?? expeditionXpForHours(Math.round(Number(row.duration_ms) / 3_600_000)); // 오퍼 확정 XP(2026-09-01), 구행은 평균 폴백
    const next = applyExpeditionXp(st.level, BigInt(st.xp), xpGained);
    await tx.execute(sql`
      update expedition_state set level = ${next.level}, xp = ${next.xp}
      where user_id = ${userId}::uuid and server_id = ${serverId}
    `);

    return { reward, crit, xpGained, level: next.level, levelUp: next.level > st.level };
  });
}

