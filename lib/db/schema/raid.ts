/**
 * SCHEMA §6. 레이드 (플레이어 호스팅 co-op)
 *
 * 개설 1000다이아·동시 3·일일 5·6시간 공격창. 미스 없음·크리 ×1.5·뎀 ±30%.
 * 보상 = 1회+ 공격 전원 동일(기여도 가중 없음). totalDamage는 표시용. 6h 만료 lazy+cron 멱등.
 */
import {
  pgTable,
  smallint,
  pgEnum,
  uuid,
  text,
  bigint,
  bigserial,
  integer,
  boolean,
  timestamp,
  date,
  jsonb,
  index,
  uniqueIndex,
  primaryKey,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

import { profiles } from './profiles';

export const raidBossEnum = pgEnum('raid_boss', [
  'slime_king',
  'orc_chief',
  'stone_golem',
  'dragon_west',
  'fallen_angel',
]);
export const raidStatusEnum = pgEnum('raid_status', ['active', 'settled']);

/** §6.1 raids. phase n HP = phase1_hp × 1.5^(n-1) (BALANCE §5.2). */
export const raids = pgTable(
  'raids',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    /** 소속 서버(SERVER.md P4). */
    serverId: smallint('server_id').notNull().default(1),
    hostUserId: uuid('host_user_id')
      .notNull()
      .references(() => profiles.id),
    bossCode: raidBossEnum('boss_code').notNull(),
    phase1Hp: bigint('phase1_hp', { mode: 'bigint' }).notNull(),
    shareCode: text('share_code').notNull().unique(),
    openedAt: timestamp('opened_at', { withTimezone: true }).notNull().defaultNow(),
    /** = opened_at + 6h (BALANCE §5.1). */
    expireAt: timestamp('expire_at', { withTimezone: true }).notNull(),
    phasesCleared: integer('phases_cleared').notNull().default(0),
    status: raidStatusEnum('status').notNull().default('active'),
    settledAt: timestamp('settled_at', { withTimezone: true }),
    /** (legacy) 0045 이전 친구 공개 플래그 — 현재는 friendShare로 대체(미사용). */
    visibleToFriends: boolean('visible_to_friends').notNull().default(false),
    /** 친구 공개·참가 모드: 'off' | 'free'(즉시) | 'approval'(요청→수락). */
    friendShare: text('friend_share').notNull().default('off'),
    /** 길드 공개·참가 모드: 'off' | 'free' | 'approval'. */
    guildShare: text('guild_share').notNull().default('off'),
  },
  (t) => [index('raid_status_expire_idx').on(t.status, t.expireAt)],
);

/**
 * 공유링크 참가 요청 — 0045. 링크(/raid-invite) 참가는 즉시 X, 개설자 수락 필요(링크 유출 대비).
 * 친구/길드 목록 참가는 신뢰 경로라 요청 없이 즉시. status: pending|approved|rejected.
 */
export const raidJoinRequests = pgTable(
  'raid_join_requests',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    raidId: bigint('raid_id', { mode: 'bigint' })
      .notNull()
      .references(() => raids.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    status: text('status').notNull().default('pending'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
  },
  (t) => [uniqueIndex('raid_join_request_uq').on(t.raidId, t.userId)],
);

/** §6.2 raid_participants. totalDamage = 표시용(보상 가중 아님). */
export const raidParticipants = pgTable(
  'raid_participants',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    raidId: bigint('raid_id', { mode: 'bigint' })
      .notNull()
      .references(() => raids.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    attacksUsed: integer('attacks_used').notNull().default(0),
    extraAttacks: integer('extra_attacks').notNull().default(0),
    totalDamage: bigint('total_damage', { mode: 'bigint' }).notNull().default(sql`0`),
    /** 최근 추가공격 구매 멱등키(0109) — 응답 유실 재시도의 이중 차감 방지. */
    lastBuyKey: uuid('last_buy_key'),
    joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('raid_participant_uq').on(t.raidId, t.userId)],
);

/** §6.3 raid_attacks — append-only. */
export const raidAttacks = pgTable('raid_attacks', {
  id: bigserial('id', { mode: 'bigint' }).primaryKey(),
  raidId: bigint('raid_id', { mode: 'bigint' }).notNull(),
  userId: uuid('user_id').notNull(),
  seq: integer('seq').notNull(),
  damage: bigint('damage', { mode: 'bigint' }).notNull(),
  isCrit: boolean('is_crit').notNull(),
  isExtra: boolean('is_extra').notNull(),
  /** 추가 공격 비용(다이아), 기본 공격=0. */
  diamondCost: bigint('diamond_cost', { mode: 'bigint' }).notNull().default(sql`0`),
  /** 보석 공격 멱등키(0109, partial unique) — 같은 키 재시도는 이 행을 결과로 반환. */
  idempotencyKey: uuid('idempotency_key'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/** §6.4 raid_rewards — 정산 멱등. (raid_id,user_id) UNIQUE. claimed_at: 인페이지 수령 stamping. */
export const raidRewards = pgTable(
  'raid_rewards',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    raidId: bigint('raid_id', { mode: 'bigint' })
      .notNull()
      .references(() => raids.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    /** 페이즈 돌파 추첨(50%) 다이아 합. */
    phaseDiamond: bigint('phase_diamond', { mode: 'bigint' }).notNull().default(sql`0`),
    /** 슬롯별 지급 보급 상자 수 { weapon, armor, accessory }. */
    boxes: jsonb('boxes').$type<{ weapon: number; armor: number; accessory: number }>().notNull(),
    /** 인페이지 수령 시각 — IS NULL = 미수령. 조건부 stamping으로 동시 수령 레이스 차단. */
    claimedAt: timestamp('claimed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('raid_reward_uq').on(t.raidId, t.userId)],
);

/** §6.5 raid_daily_counts — 일일 5회 한도(KST). 동시 3은 active 카운트로 검사. */
export const raidDailyCounts = pgTable(
  'raid_daily_counts',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    /** 소속 서버(SERVER.md P4) — 일일 한도는 서버별. */
    serverId: smallint('server_id').notNull().default(1),
    kstDate: date('kst_date').notNull(),
    startedCount: integer('started_count').notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.userId, t.serverId, t.kstDate] })],
);

export type Raid = typeof raids.$inferSelect;
export type RaidParticipant = typeof raidParticipants.$inferSelect;
export type RaidReward = typeof raidRewards.$inferSelect;
