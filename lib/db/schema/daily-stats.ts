import { pgTable, uuid, smallint, date, bigint, integer, primaryKey, text, timestamp, index } from 'drizzle-orm/pg-core';

/**
 * 0120 오늘의 인생강화 — KST 자정 유저 지표 스냅샷("어제와 비교"의 기준선).
 * 자정 크론(daily-stats)이 leaderboard_ranks 피벗으로 기록, 31일 지난 행은 정리(7·30일 전투력 비교용).
 * 스냅샷 부재(자정 이후 가입·크론 유실)면 UI는 증감 없이 현재값만 표시(안전 폴백).
 */
export const userDailyStats = pgTable(
  'user_daily_stats',
  {
    userId: uuid('user_id').notNull(),
    serverId: smallint('server_id').notNull(),
    kstDay: date('kst_day', { mode: 'string' }).notNull(),
    combat: bigint('combat', { mode: 'bigint' }).notNull().default(0n),
    maxEnhance: bigint('max_enhance', { mode: 'bigint' }).notNull().default(0n),
    sumEnhance: bigint('sum_enhance', { mode: 'bigint' }).notNull().default(0n),
    combatRank: integer('combat_rank'),
    maxRank: integer('max_rank'),
    sumRank: integer('sum_rank'),
    raidRank: integer('raid_rank'),
  },
  (t) => [primaryKey({ columns: [t.userId, t.serverId, t.kstDay] })],
);

/** 하트비트가 판정한 클라 플랫폼(0199). 통계 전용. */
export type ClientPlatform = 'twa' | 'pwa' | 'web';

/**
 * 0199 platform_daily — 플랫폼별 일일 접속(앱/PWA/웹 DAU). /api/presence가 하루 1행 upsert.
 * 한 유저가 하루에 두 플랫폼을 쓰면 두 행 — 플랫폼별 합이 DAU를 넘을 수 있다.
 */
export const platformDaily = pgTable(
  'platform_daily',
  {
    kstDay: date('kst_day', { mode: 'string' }).notNull(),
    serverId: smallint('server_id').notNull().default(1),
    userId: uuid('user_id').notNull(),
    platform: text('platform').$type<ClientPlatform>().notNull(),
    firstSeenAt: timestamp('first_seen_at', { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.kstDay, t.serverId, t.userId, t.platform] }), index('platform_daily_day_idx').on(t.kstDay, t.platform)],
);
