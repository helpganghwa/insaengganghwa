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
 * §22 codex_champions — 아이템(catalog)별 강화랭킹 상위 3위 스냅샷(cron 사전계산, 감사 S3).
 * 해방등수(liberatedItemRanks)가 매 호출 상관 서브쿼리로 "앞선 사람 수"를 세던 것을, catalog별
 * row_number ≤ 3을 미리 적재해 (server,user) 단일 인덱스 조회로 대체. 6개 핫패스 경량화.
 */
export const codexChampions = pgTable(
  'codex_champions',
  {
    serverId: smallint('server_id').notNull(),
    catalogItemId: integer('catalog_item_id').notNull(),
    userId: uuid('user_id').notNull(),
    rank: integer('rank').notNull(), // 1~3
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.serverId, t.catalogItemId, t.rank] }),
    index('codex_champions_user_idx').on(t.serverId, t.userId),
  ],
);

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
