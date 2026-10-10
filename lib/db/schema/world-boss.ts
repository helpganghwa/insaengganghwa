/**
 * 월드보스(docs/WORLD-BOSS.md) — 하루 1마리, 점령 구역 한 곳에 48시간. 점령 길드원이 원정대를 만들고 누구나 참가해
 * 라운드제로 맞선다. 피해가 쌓이면 단계가 오르고 전리품이 쌓이며, 떠날 때 그 구역 주인 길드의 금고로 들어간다.
 * 표는 0228(0229 = 우편 종류)이 만든다 — 적용 전엔 inert.
 */
import { sql } from 'drizzle-orm';
import { bigint, bigserial, date, index, integer, jsonb, pgTable, primaryKey, smallint, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

import { guilds, zones } from './guild';
import { profiles } from './profiles';

export type WorldBossStatus = 'scheduled' | 'active' | 'left';
export type WorldBossPartyStatus = 'recruiting' | 'departed' | 'disbanded';
export type WorldBossJoinStatus = 'pending' | 'accepted' | 'rejected';
export type WorldBossWeakPhase = { weapon: string[]; armor: string[]; accessory: string[] };

/** 보스 1마리 = 1행. 관리자가 구역을 지정해 소환(10-11, 0233) — 같은 날 여러 마리 가능, 구역당 출현 중/예정은 한 마리(소환 트랜잭션이 검사). */
export const worldBosses = pgTable(
  'world_bosses',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    serverId: smallint('server_id').notNull(),
    zoneId: integer('zone_id')
      .notNull()
      .references(() => zones.id, { onDelete: 'cascade' }),
    /** 보스 종류 = 출현 구역의 지역(zone_region 값 스냅샷). 그림·이름은 지역마다 하나. */
    region: text('region').notNull(),
    /** 출현 시각의 날짜(KST) — 기록·조회용. */
    kstDay: date('kst_day').notNull(),
    /** 출현 시각(관리자가 즉시 또는 예약으로 지정). 이 시각 전에는 status 'scheduled'. */
    spawnAt: timestamp('spawn_at', { withTimezone: true }).notNull(),
    /** = spawn_at + WORLD_BOSS_STAY_MS. 지나면 크론이 정산하고 'left'. */
    leaveAt: timestamp('leave_at', { withTimezone: true }).notNull(),
    status: text('status').$type<WorldBossStatus>().notNull().default('scheduled'),
    totalDamage: bigint('total_damage', { mode: 'bigint' }).notNull().default(sql`0`),
    /** 누적 피해로 넘긴 단계 수(서버 공통 단계표, worldBossStageFor). */
    stage: integer('stage').notNull().default(0),
    /** 단계가 오를 때마다 쌓인 전리품 — 떠날 때 주인 길드 금고로. */
    lootDiamond: bigint('loot_diamond', { mode: 'bigint' }).notNull().default(sql`0`),
    lootBoxes: integer('loot_boxes').notNull().default(0),
    /** 출현 때 구역 주인(기록용 — 떠날 때 주인과 다르면 빼앗긴 것). */
    spawnOwnerGuildId: bigint('spawn_owner_guild_id', { mode: 'bigint' }).references(() => guilds.id, { onDelete: 'set null' }),
    /** 떠날 때 전리품을 받은 길드(그 시점 구역 주인). 중립이면 null = 전리품 소멸. */
    settledGuildId: bigint('settled_guild_id', { mode: 'bigint' }).references(() => guilds.id, { onDelete: 'set null' }),
    settledAt: timestamp('settled_at', { withTimezone: true }),
    /** 페이즈별 약점 장비(0230) — 원소 하나 = 페이즈 하나 {weapon, armor, accessory: code[]}. 소환 때 고정, 비면 첫 출발 때 채운다. */
    weak: jsonb('weak').$type<WorldBossWeakPhase[]>().notNull().default(sql`'[]'::jsonb`),
    /** 특성 코드(0232, 0~2개) — 소환 때 추첨해 고정(WORLD_BOSS_TRAITS). 옛 행은 빈 배열 = 특성 없음. */
    traits: jsonb('traits').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('world_bosses_server_day_idx').on(t.serverId, t.kstDay),
    index('world_bosses_server_status_idx').on(t.serverId, t.status),
  ],
);

/** 원정대 — 점령 길드원이 만든다(guild_id = 만든 시점의 구역 주인). 출발하면 전투 결과를 이 행에 담는다. */
export const worldBossParties = pgTable(
  'world_boss_parties',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    bossId: bigint('boss_id', { mode: 'bigint' })
      .notNull()
      .references(() => worldBosses.id, { onDelete: 'cascade' }),
    serverId: smallint('server_id').notNull(),
    leaderUserId: uuid('leader_user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    guildId: bigint('guild_id', { mode: 'bigint' })
      .notNull()
      .references(() => guilds.id, { onDelete: 'cascade' }),
    /** 소개글(0231, 선택·WORLD_BOSS_PARTY_INTRO_MAX자) — 만들 때 적고 모집 카드에 보인다. */
    intro: text('intro'),
    status: text('status').$type<WorldBossPartyStatus>().notNull().default('recruiting'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    departedAt: timestamp('departed_at', { withTimezone: true }),
    /** 해산 사유 — 'leader_left' | 'boss_left' | 'leader' ('owner_changed'는 10-11 폐지, 옛 행에만 남는다) */
    disbandReason: text('disband_reason'),
    rounds: integer('rounds').notNull().default(0),
    damage: bigint('damage', { mode: 'bigint' }).notNull().default(sql`0`),
    /** 이 원정대가 올린 단계 구간(출발 전 단계 → 출발 뒤 단계). */
    stageFrom: integer('stage_from'),
    stageTo: integer('stage_to'),
    /** 재생 기록(WorldBossFinale). */
    finale: jsonb('finale').$type<unknown>(),
    rewardDiamond: integer('reward_diamond').notNull().default(0),
    rewardBoxes: integer('reward_boxes').notNull().default(0),
    /** 출발 멱등 키(클라가 요청마다 생성) — 같은 키 재전송은 한 번만 출발. */
    departKey: uuid('depart_key'),
  },
  (t) => [
    index('world_boss_parties_boss_idx').on(t.bossId, t.status),
    index('world_boss_parties_leader_idx').on(t.leaderUserId),
    uniqueIndex('world_boss_parties_depart_key_uq').on(t.departKey).where(sql`${t.departKey} is not null`),
  ],
);

/** 참가자. (boss_id, user_id) 유니크 = 보스 하나에 1인 1번(모집 중 나가면 행 삭제, 출발하면 영구). */
export const worldBossPartyMembers = pgTable(
  'world_boss_party_members',
  {
    partyId: bigint('party_id', { mode: 'bigint' })
      .notNull()
      .references(() => worldBossParties.id, { onDelete: 'cascade' }),
    bossId: bigint('boss_id', { mode: 'bigint' })
      .notNull()
      .references(() => worldBosses.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    serverId: smallint('server_id').notNull(),
    joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
    /** 전투 결과(출발 뒤 채움). fell_round null = 끝까지 생존. */
    attacks: integer('attacks').notNull().default(0),
    damage: bigint('damage', { mode: 'bigint' }).notNull().default(sql`0`),
    fellRound: integer('fell_round'),
  },
  (t) => [
    primaryKey({ columns: [t.partyId, t.userId] }),
    uniqueIndex('world_boss_party_members_boss_user_uq').on(t.bossId, t.userId),
    index('world_boss_party_members_user_idx').on(t.userId),
  ],
);

/** 참가 신청 — 수락·거절은 대장. 수락되면 members에 들어간다. */
export const worldBossJoinRequests = pgTable(
  'world_boss_join_requests',
  {
    partyId: bigint('party_id', { mode: 'bigint' })
      .notNull()
      .references(() => worldBossParties.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    status: text('status').$type<WorldBossJoinStatus>().notNull().default('pending'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
  },
  (t) => [primaryKey({ columns: [t.partyId, t.userId] }), index('world_boss_join_requests_user_idx').on(t.userId, t.status)],
);

export type WorldBoss = typeof worldBosses.$inferSelect;
export type WorldBossParty = typeof worldBossParties.$inferSelect;
export type WorldBossPartyMember = typeof worldBossPartyMembers.$inferSelect;

/** 맞혀서 공개된 약점(0230) — (보스, 페이즈, 장비) 하나에 한 행. 처음 맞힌 대원 이름을 남긴다(보상 없음). */
export const worldBossWeakReveals = pgTable(
  'world_boss_weak_reveals',
  {
    bossId: bigint('boss_id', { mode: 'bigint' })
      .notNull()
      .references(() => worldBosses.id, { onDelete: 'cascade' }),
    phase: smallint('phase').notNull(),
    code: text('code').notNull(),
    slot: text('slot').notNull(),
    finderUserId: uuid('finder_user_id').references(() => profiles.id, { onDelete: 'set null' }),
    finderNickname: text('finder_nickname').notNull(),
    partyId: bigint('party_id', { mode: 'bigint' }).references(() => worldBossParties.id, { onDelete: 'set null' }),
    revealedAt: timestamp('revealed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.bossId, t.phase, t.code] })],
);
