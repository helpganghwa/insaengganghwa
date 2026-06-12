import { pgTable, smallint, text, timestamp, uuid, primaryKey, index } from 'drizzle-orm/pg-core';

import { profiles } from './profiles';

/**
 * 서버(논리 월드) — SERVER.md. 단일 DB 안에서 server_id로 게임 월드 분리.
 * 계정(카카오·결제·닉네임)은 전역, 캐릭터(게임 진행·다이아 지갑)는 서버별.
 */
export const servers = pgTable('servers', {
  id: smallint('id').primaryKey(),
  name: text('name').notNull(),
  /** open(정상) | full(신규 캐릭터 생성 제한) | closed(준비/통합 대비) */
  status: text('status').notNull().default('open'),
  openedAt: timestamp('opened_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * 캐릭터 — 계정과 분리된 서버별 진행 단위(SERVER.md §2). 1계정 = 서버당 1캐릭터.
 * 서버별 스칼라 상태(다이아 지갑·거주지·튜토리얼)는 SERVER.md §5 단계에 따라 이관된다.
 */
export const characters = pgTable(
  'characters',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    serverId: smallint('server_id')
      .notNull()
      .references(() => servers.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.serverId] }), index('characters_server_idx').on(t.serverId)],
);
