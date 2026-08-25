import {
  bigint,
  bigserial,
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

import { profiles } from './profiles';
import { userProfiles } from './avatar';
import { zoneRegionEnum } from './guild';

/**
 * §20 파견 (EXPEDITION.md A′ — 2026-08-25 확정) — 미션 롤 × 아바타 배정.
 *
 * 한 테이블 상태 머신: offer(미션 오퍼, 보상 사전 확정 롤) → running(아바타 배정·시작)
 * → claimed | cancelled. 새로고침·자정 교체는 offer 행 교체(재롤). 대성공(10%)만 수령 시 판정.
 * 판정 원칙: 롤·시계·지급 전부 서버(§3.1·§3.2). BALANCE 상수(EXPEDITION_*)가 수치 정본.
 */
export const expeditionDifficultyEnum = pgEnum('expedition_difficulty', [
  'easy', // 쉬움 4h
  'normal', // 보통 8h
  'hard', // 어려움 12h
  'grand', // 원정 24h — 파견 Lv.5부터 출현(분포는 레벨 구간별, balance.ts)
]);
export const expeditionStatusEnum = pgEnum('expedition_status', [
  'offer',
  'running',
  'claimed',
  'cancelled',
]);

export const expeditions = pgTable(
  'expeditions',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    /** 소속 서버(SERVER.md P3b) — 보상·카운터가 서버 지갑에 귀속. */
    serverId: smallint('server_id').notNull().default(1),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    /** 미션 슬롯 1..3 — 해금 상태는 expedition_state.slots 참조. */
    slot: smallint('slot').notNull(),
    region: zoneRegionEnum('region').notNull(),
    difficulty: expeditionDifficultyEnum('difficulty').notNull(),
    /** 난이도 시간 스냅샷(ms) — 상수 변경이 진행 중 미션에 소급되지 않게(§6.1(C) 원칙). */
    durationMs: bigint('duration_ms', { mode: 'bigint' }).notNull(),
    /**
     * 오퍼 시 사전 확정 롤(A′ 핵심 — 카드에 확정 표기, 새로고침=보상 리롤):
     * `{ kind: 'box'|'dia'|'both', boxes?: {weapon,armor,accessory}, diamond?: number }`.
     * 배율(레벨·시너지) 적용 전 기본값 — 최종은 시작 시 finalReward로 스냅샷.
     */
    reward: jsonb('reward').notNull(),
    status: expeditionStatusEnum('status').notNull().default('offer'),
    /** 오퍼 생성 시각 — 자정 전체 교체 판정(KST 날짜가 바뀐 offer는 재롤 대상). */
    rolledAt: timestamp('rolled_at', { withTimezone: true }).notNull().defaultNow(),
    /** 배정 아바타(미션당 1명) — 아바타 삭제 시에도 파견 기록은 남긴다(set null). */
    avatarProfileId: uuid('avatar_profile_id').references(() => userProfiles.id, {
      onDelete: 'set null',
    }),
    /** 시작 시점 확정 배율 스냅샷(bp) — 분쟁·검증용(배정 아바타 장비 기준·§3.2). */
    synergyBp: integer('synergy_bp').notNull().default(0),
    levelBonusBp: integer('level_bonus_bp').notNull().default(0),
    /** 시작 시점 최종 확정 보상(배율 적용) — 수령은 이 값 지급 + 대성공 판정만. */
    finalReward: jsonb('final_reward'),
    startedAt: timestamp('started_at', { withTimezone: true }),
    /** 서버 시계 stamping(§3.2) — 수령 판정 기준. */
    completeAt: timestamp('complete_at', { withTimezone: true }),
    /** 다이아 즉시완료 단축 누적(ms) — 강화 단축과 동일 환산률. */
    reducedMs: bigint('reduced_ms', { mode: 'bigint' }).notNull().default(sql`0`),
    /** 수령 시 대성공(10%, ×2) 판정 결과 — 수령 전 null. */
    crit: boolean('crit'),
    /** 귀환 푸시 발송 마킹(0173) — cron 원자 클레임(push-enhance-ready 패턴). */
    pushSent: boolean('push_sent').notNull().default(false),
    claimedAt: timestamp('claimed_at', { withTimezone: true }),
  },
  (t) => [
    // 슬롯당 활성(offer/running) 1건 — 새로고침·시작·수령 경합의 정합 기반.
    uniqueIndex('expeditions_one_active')
      .on(t.userId, t.serverId, t.slot)
      .where(sql`${t.status} in ('offer', 'running')`),
    // 아바타 중복 배정 방지 — 파견 중(running) 아바타는 한 곳에만.
    uniqueIndex('expeditions_avatar_busy')
      .on(t.avatarProfileId)
      .where(sql`${t.status} = 'running' and ${t.avatarProfileId} is not null`),
    index('expeditions_user_status_idx').on(t.userId, t.serverId, t.status),
  ],
);
export type Expedition = typeof expeditions.$inferSelect;

/**
 * 파견 유저 상태(user×server 1행) — 레벨/XP·슬롯 해금·일일 카운터.
 * 카운터는 KST 일자 컬럼과 쌍(체크인 패턴): 날짜가 다르면 0으로 보고 갱신 시 리셋.
 */
export const expeditionState = pgTable(
  'expedition_state',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    serverId: smallint('server_id').notNull().default(1),
    /** 누적이 아닌 "현재 레벨 내 잔여 XP"(강화·길드 xp와 동일 규약 — 비교는 (level, xp) 사전식). */
    xp: bigint('xp', { mode: 'bigint' }).notNull().default(sql`0`),
    level: integer('level').notNull().default(0),
    /**
     * 다이아로 구매한 슬롯 수(1=기본만). 실효 슬롯 = max(이 값, 레벨 무료 해금분) —
     * 레벨 도달 무료 오픈은 파생 판정(EXPEDITION_SLOT_UNLOCKS)이라 별도 기록 불필요.
     */
    slotsPurchased: smallint('slots_purchased').notNull().default(1),
    /** 일일 시작(투입) 카운터 — 6회 상한(취소 미반환). */
    startsKstDay: date('starts_kst_day', { mode: 'string' }),
    startsToday: smallint('starts_today').notNull().default(0),
    /** 일일 무료 새로고침 카운터 — 3회 소진 후 💎20. */
    refreshKstDay: date('refresh_kst_day', { mode: 'string' }),
    refreshToday: smallint('refresh_today').notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.userId, t.serverId] })],
);
export type ExpeditionState = typeof expeditionState.$inferSelect;
