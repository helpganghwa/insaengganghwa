/**
 * SCHEMA §16. 친구(friend_links) — 검색→요청→수락.
 * status='pending'(요청 중) | 'accepted'(친구). 친구 = accepted & (requester or addressee = 나).
 * 방향 1행만 저장(요청자 requester→수락자 addressee). 역방향 중복 요청은 로직에서 차단.
 */
import { sql } from 'drizzle-orm';
import { pgTable, uuid, text, timestamp, primaryKey, index, uniqueIndex, smallint } from 'drizzle-orm/pg-core';

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
    // 무방향 쌍 유니크(0104) — 방향 PK로는 A→B·B→A 두 행이 공존 가능. 정렬 쌍 유니크로
    // 한 쌍당 링크 1행을 하드 보장(상호 동시 요청 레이스의 최후 방어; advisory 락과 이중화).
    uniqueIndex('friend_pair_uq').on(
      t.serverId,
      sql`least(${t.requesterId}, ${t.addresseeId})`,
      sql`greatest(${t.requesterId}, ${t.addresseeId})`,
    ),
  ],
);

export type FriendLink = typeof friendLinks.$inferSelect;
