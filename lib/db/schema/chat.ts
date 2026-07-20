/**
 * SCHEMA §18. 월드 채팅(0125, 2026-07-20) — 서버(논리 월드)별 공개 채팅.
 * 전송은 Server Action 단일 경로(검증·필터·리밋), 수신은 Supabase Realtime broadcast + 폴백 폴링.
 * 보존: 서버당 최근 1,000개 + 7일(mail-expire 크론에서 정리).
 */
import { sql } from 'drizzle-orm';
import { bigserial, index, jsonb, pgTable, primaryKey, smallint, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { profiles } from './profiles';

export const chatMessages = pgTable(
  'chat_messages',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    serverId: smallint('server_id').notNull(),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    /** 서버 필터(금칙어 마스킹) 후 저장 — 원문 미보존. 최대 200자(액션 검증). */
    body: text('body').notNull(),
    /** 장비 자랑 태그 스냅샷 {n,c,s,e,t,cp}(0127) — null=일반 메시지. */
    item: jsonb('item'),
    /** 모더레이션 숨김(신고 3건 자동 또는 어드민) — null=노출. */
    hiddenAt: timestamp('hidden_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('chat_msg_server_id_idx').on(t.serverId, sql`${t.id} desc`)],
);

export const chatReports = pgTable(
  'chat_reports',
  {
    messageId: bigserial('message_id', { mode: 'bigint' })
      .notNull()
      .references(() => chatMessages.id, { onDelete: 'cascade' }),
    reporterUserId: uuid('reporter_user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.messageId, t.reporterUserId] })],
);

/** 채팅 차단(0126) — 계정 귀속(서버 무관). 닉네임은 조회 시 characters 조인. */
export const chatBlocks = pgTable(
  'chat_blocks',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    blockedUserId: uuid('blocked_user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.blockedUserId] })],
);

export type ChatMessage = typeof chatMessages.$inferSelect;
