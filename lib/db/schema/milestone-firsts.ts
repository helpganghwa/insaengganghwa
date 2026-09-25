import { pgTable, primaryKey, smallint, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';

import { profiles } from './profiles';

/**
 * 최초 이정표 기록(0218, 2026-09-26) — 서버·이정표별 첫 세 사람. 최초 이정표 칭호(first_<이정표>_<rank>) 판정의 정본.
 * rank 1~3 = 도달 순서(금·은·동). 기록은 lib/game/titles/first-milestones.ts recordFirstMilestones 한 경로.
 */
export const milestoneFirsts = pgTable(
  'milestone_firsts',
  {
    serverId: smallint('server_id').notNull(),
    /** lib/game/balance.ts FIRST_MILESTONES key — enh500 | sum20k | t30 | combat10m. */
    milestone: text('milestone').notNull(),
    rank: smallint('rank').notNull(),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    reachedAt: timestamp('reached_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.serverId, t.milestone, t.rank] }), unique('milestone_firsts_user_uq').on(t.serverId, t.milestone, t.userId)],
);
