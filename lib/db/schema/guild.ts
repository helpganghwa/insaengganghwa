/**
 * GUILD.md §1~§5.6. 길드 — 협력 성장 + 월드맵 점령전.
 *
 * 마지막 콘텐츠(출시·DAU 이후 투입). 점령은 결정론·비동기(KST 12:00 정산, 별도 팀전 엔진).
 * 수용 = min(50, 10+level)·레벨 무제한(L41+ 과시). 50명=50구역=이론상 천하통일(영주제로 자연 견제).
 * 세금: 거주 구역 강화 성공 → 구역 포인트 누적 → 영주 수집(1h) → 길드 풀 → 100:1💎 분배(균등/특정).
 * 수치(레벨 XP·수비 ±·환산율)는 BALANCE/시뮬 튜닝 — 본 스키마는 구조만.
 *
 * ⚠ 본 스키마의 실제 테이블 생성은 **별도 수동 마이그레이션**(아직 미작성/미적용) — 적용 전엔 inert.
 *   순환 import 회피: profiles.residence_zone_id → zones FK는 마이그레이션 ALTER로 추가.
 */
import {
  pgTable,
  pgEnum,
  uuid,
  text,
  bigint,
  bigserial,
  integer,
  real,
  date,
  jsonb,
  timestamp,
  index,
  uniqueIndex,
  primaryKey,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

import { profiles } from './profiles';

export const guildRoleEnum = pgEnum('guild_role', ['leader', 'vice', 'member']);
export const zoneRegionEnum = pgEnum('zone_region', [
  'volcano',
  'temple',
  'swamp',
  'orc',
  'kingdom', // 중앙 인간 왕국(6)
  'angel', // 분리된 타락 천사 부유섬(4)
]); // 'sky'(구 중앙 천사섬)는 폐기 — DB enum엔 잔존하나 미사용
export const guildDeployRoleEnum = pgEnum('guild_deploy_role', ['attack', 'defend']);

/** §1·§2 guilds. name 변경불가. level=수용(10+level, L40서 50상한)+무제한(L41+ 과시, 혜택0). */
export const guilds = pgTable('guilds', {
  id: bigserial('id', { mode: 'bigint' }).primaryKey(),
  name: text('name').notNull().unique(),
  /** 3축(모양·색상톤·키워드) Pixellab 생성물(§1.6). 생성 전/실패 시 null → 폴백 문양. */
  emblemUrl: text('emblem_url'),
  /** 선택 색상톤 — UI 악센트(맵 구분은 문양 썸네일). */
  emblemColor: text('emblem_color'),
  /** 길드 공지 ≤60자(길드장/부길드장만 편집). */
  notice: text('notice'),
  /** 0+. 무제한 — 수용은 min(50,10+level), L41+는 과시·랭킹용(버프·전투력 영향 0). */
  level: integer('level').notNull().default(0),
  xp: bigint('xp', { mode: 'bigint' }).notNull().default(sql`0`),
  /** 영주 수집으로 누적된 미분배 세금 포인트(100:1💎 환산 전). */
  taxPoolPoints: bigint('tax_pool_points', { mode: 'bigint' }).notNull().default(sql`0`),
  leaderUserId: uuid('leader_user_id')
    .notNull()
    .references(() => profiles.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/** §1 guild_members — user_id PK = 1유저 1길드. 기여도=기부+미션(점령전 제외, §3). */
export const guildMembers = pgTable(
  'guild_members',
  {
    userId: uuid('user_id')
      .primaryKey()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    guildId: bigint('guild_id', { mode: 'bigint' })
      .notNull()
      .references(() => guilds.id, { onDelete: 'cascade' }),
    role: guildRoleEnum('role').notNull().default('member'),
    contributionPoints: bigint('contribution_points', { mode: 'bigint' }).notNull().default(sql`0`),
    /** 일 3회 기부 카운터(KST 자정 리셋). */
    dailyDonationCount: integer('daily_donation_count').notNull().default(0),
    lastDonationKstDay: date('last_donation_kst_day'),
    joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('guild_member_guild_idx').on(t.guildId)],
);

/** §1 탈퇴 로그 — 24h 재가입 제한(가장 최근 left_at 기준). append-only. */
export const guildLeaveLog = pgTable(
  'guild_leave_log',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    leftAt: timestamp('left_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('guild_leave_user_idx').on(t.userId, t.leftAt)],
);

/** §5.2·§5.6 zones — 총 50(시드 고정 id). 좌표만(인접은 zone_adjacency). owner/lord nullable=중립. */
export const zones = pgTable(
  'zones',
  {
    id: integer('id').primaryKey(),
    region: zoneRegionEnum('region').notNull(),
    name: text('name').notNull(),
    /** 오버레이 % 좌표(0~100, 해상도 독립). */
    mapX: real('map_x').notNull(),
    mapY: real('map_y').notNull(),
    /** null = 중립. 점령 시 set, 패배/해산 시 null. */
    ownerGuildId: bigint('owner_guild_id', { mode: 'bigint' }).references(() => guilds.id, {
      onDelete: 'set null',
    }),
    /** 영주(상시) — 세금 수집권·자동 방어(×3). 소유 시 ≥1 필수. */
    lordUserId: uuid('lord_user_id').references(() => profiles.id, { onDelete: 'set null' }),
    /** 미수집 누적 세금 포인트(점령 시 신 소유자로 이전). */
    taxPoints: bigint('tax_points', { mode: 'bigint' }).notNull().default(sql`0`),
    /** 영주 수집 1h 쿨다운 기준. */
    lastTaxCollectedAt: timestamp('last_tax_collected_at', { withTimezone: true }),
    capturedAt: timestamp('captured_at', { withTimezone: true }),
  },
  (t) => [index('zone_owner_idx').on(t.ownerGuildId)],
);

/** §5.6 zone_adjacency — **현재 미사용**(인접 규칙 없음). 정규형 a<b. 미래(확장형 점령/연결선) 대비. */
export const zoneAdjacency = pgTable(
  'zone_adjacency',
  {
    zoneA: integer('zone_a')
      .notNull()
      .references(() => zones.id, { onDelete: 'cascade' }),
    zoneB: integer('zone_b')
      .notNull()
      .references(() => zones.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.zoneA, t.zoneB] })],
);

/** §5.4 guild_battle_deployments — 1인 1배치/일(KST). 12:00 잠금. 영주는 자동 방어(미기록). */
export const guildBattleDeployments = pgTable(
  'guild_battle_deployments',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    battleKstDay: date('battle_kst_day').notNull(),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    guildId: bigint('guild_id', { mode: 'bigint' })
      .notNull()
      .references(() => guilds.id, { onDelete: 'cascade' }),
    zoneId: integer('zone_id')
      .notNull()
      .references(() => zones.id, { onDelete: 'cascade' }),
    role: guildDeployRoleEnum('role').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('deploy_user_day_uq').on(t.userId, t.battleKstDay),
    index('deploy_zone_day_idx').on(t.zoneId, t.battleKstDay),
  ],
);

/** §5.4 conquest_battles — 구역×일 1전투(결정론 팀전 엔진). finale=참가자·전투력·리플레이. */
export const conquestBattles = pgTable(
  'conquest_battles',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    battleKstDay: date('battle_kst_day').notNull(),
    zoneId: integer('zone_id')
      .notNull()
      .references(() => zones.id, { onDelete: 'cascade' }),
    /** null = 전투 없음(무공격). 소유권 변동 없을 수도. */
    winnerGuildId: bigint('winner_guild_id', { mode: 'bigint' }).references(() => guilds.id, {
      onDelete: 'set null',
    }),
    finale: jsonb('finale').$type<unknown>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('conquest_zone_day_uq').on(t.zoneId, t.battleKstDay)],
);

export type Guild = typeof guilds.$inferSelect;
export type GuildMember = typeof guildMembers.$inferSelect;
export type Zone = typeof zones.$inferSelect;
export type GuildBattleDeployment = typeof guildBattleDeployments.$inferSelect;
export type ConquestBattle = typeof conquestBattles.$inferSelect;
