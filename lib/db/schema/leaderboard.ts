import {
  bigint,
  index,
  integer,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

/**
 * §21 leaderboard_ranks — 리더보드 사전계산 스냅샷(cron이 N분마다 재계산해 적재).
 *
 * 읽기를 유저 수와 무관하게 싸게: Top-N은 (server,metric,rank) 인덱스로, "내 순위"는 PK 단일행,
 * "임의 값의 순위"는 (server,metric,value) 인덱스 count로. 무거운 전 유저 집계(특히 전투력 앱계산)는
 * 요청 경로가 아니라 cron(leaderboard-snapshot)에서 수행. nickname/publicCode는 읽기 시 조인(신선).
 */
export const leaderboardRanks = pgTable(
  'leaderboard_ranks',
  {
    serverId: smallint('server_id').notNull(),
    /** max|sum|combat|raid|melee */
    metric: text('metric').notNull(),
    userId: uuid('user_id').notNull(),
    value: bigint('value', { mode: 'number' }).notNull(),
    rank: integer('rank').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.serverId, t.metric, t.userId] }),
    index('leaderboard_ranks_top_idx').on(t.serverId, t.metric, t.rank),
    index('leaderboard_ranks_value_idx').on(t.serverId, t.metric, t.value),
  ],
);
