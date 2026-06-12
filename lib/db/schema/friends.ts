/**
 * SCHEMA §16. 친구(friend_links) — 검색→요청→수락.
 * status='pending'(요청 중) | 'accepted'(친구). 친구 = accepted & (requester or addressee = 나).
 * 방향 1행만 저장(요청자 requester→수락자 addressee). 역방향 중복 요청은 로직에서 차단.
 */
import { pgTable, uuid, text, timestamp, primaryKey, index, smallint } from 'drizzle-orm/pg-core';

import { profiles } from './profiles';

export const friendLinks = pgTable(
  'friend_links',
  {
    requesterId: uuid('requester_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    addresseeId: uuid('addressee_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    /** 소속 서버(SERVER.md P4) — 친구 관계는 서버 내. */
    serverId: smallint('server_id').notNull().default(1),
    status: text('status').notNull().default('pending'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.requesterId, t.serverId, t.addresseeId] }),
    index('friend_addressee_idx').on(t.addresseeId, t.status),
    index('friend_requester_idx').on(t.requesterId, t.status),
  ],
);

export type FriendLink = typeof friendLinks.$inferSelect;
