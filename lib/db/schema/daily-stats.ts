import { pgTable, uuid, smallint, date, bigint, integer, primaryKey } from 'drizzle-orm/pg-core';

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
  },
  (t) => [primaryKey({ columns: [t.userId, t.serverId, t.kstDay] })],
);
