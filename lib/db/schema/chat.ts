/**
 * SCHEMA §18. 월드 채팅(0125, 2026-07-20) — 서버(논리 월드)별 공개 채팅.
 * 전송은 Server Action 단일 경로(검증·필터·리밋), 수신은 Supabase Realtime broadcast + 폴백 폴링.
 * 보존: 서버당 최근 1,000개 + 7일(mail-expire 크론에서 정리).
 */
import { sql } from 'drizzle-orm';
import { bigint, bigserial, index, jsonb, pgTable, primaryKey, smallint, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { profiles } from './profiles';

export const chatMessages = pgTable(
  'chat_messages',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    serverId: smallint('server_id').notNull(),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    /** 서버 필터 통과 본문(금칙어=전송 거부) — 최대 100자(CHAT_MAX_LEN, 액션 검증). */
    body: text('body').notNull(),
    /** 유효 멘션 닉 목록(0128) — 전송 시점 실제 유저와 일치한 것만(표시 시 @ 제거·강조). */
    mentions: jsonb('mentions'),
    /** 채널(0130) — null=전체(서버) 채팅, 값=해당 길드 채팅. */
    guildId: bigint('guild_id', { mode: 'bigint' }),
    /** 모더레이션 숨김(신고 3건 자동 또는 어드민) — null=노출. */
    hiddenAt: timestamp('hidden_at', { withTimezone: true }),
    /** 본인 삭제(0177) — 행은 노출되되 본문이 자리표시로 대체. 원문 보존(어드민 검수용). */
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('chat_msg_server_id_idx').on(t.serverId, sql`${t.id} desc`),
    index('chat_msg_guild_idx').on(t.serverId, t.guildId, sql`${t.id} desc`),
  ],
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

/**
 * 귓속말(0155, 2026-08-07) — 1:1 대화. 대화방 테이블 없음: (server_id, 유저쌍)이 곧 대화.
 * 서버별 완전 분리. 보존 30일 + 대화당 500건(cleanupChat). 차단은 chat_blocks 재사용.
 */
export const whisperMessages = pgTable(
  'whisper_messages',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    serverId: smallint('server_id').notNull(),
    fromUserId: uuid('from_user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    toUserId: uuid('to_user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    /** 필터 통과 본문 — 전체 채팅과 동일 100자 상한(코드 검증). */
    body: text('body').notNull(),
    /** 유효 멘션 [{n,c}] — 채팅과 동일 구조. 푸시는 상대가 멘션됐을 때만(설계 D1). */
    mentions: jsonb('mentions'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    /** 모더레이션 숨김(어드민 검수) — null=노출. */
    hiddenAt: timestamp('hidden_at', { withTimezone: true }),
    /** 본인 삭제(0177) — 양쪽 화면에 자리표시, 원문 보존. */
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    // 쌍 정규화 — 방향 무관 한 대화를 한 인덱스로.
    index('whisper_pair_idx').on(
      t.serverId,
      sql`least(${t.fromUserId}, ${t.toUserId})`,
      sql`greatest(${t.fromUserId}, ${t.toUserId})`,
      sql`${t.id} desc`,
    ),
    // 수신함 — 미니바 노티점(최신 1행)·미읽음 계산.
    index('whisper_to_idx').on(t.serverId, t.toUserId, sql`${t.id} desc`),
    // 발신함(0157) — 대화 목록은 from·to 양쪽으로 내 대화를 모으므로 짝이 있어야 전량 스캔을 면한다.
    index('whisper_from_idx').on(t.serverId, t.fromUserId, sql`${t.id} desc`),
    // 보존 정리(30일) 스캔용.
    index('whisper_created_idx').on(t.createdAt),
  ],
);

/**
 * 귓속말 메시지 신고 — 전체/길드와 동일하게 본문 탭 = 메시지 단위 신고.
 * chat_reports는 FK가 chat_messages라 재사용이 불가능해 동형 테이블로 분리했다.
 * ⚠ 자동 숨김 임계 없음 — 1:1은 신고 가능자가 상대 1명뿐이라 3건 임계가 성립하지 않고,
 * 1건 자동 숨김은 곧 어뷰징 지렛대가 된다. 처리는 어드민 검수(신고 수 노출)에서만.
 */
export const whisperReports = pgTable(
  'whisper_reports',
  {
    messageId: bigint('message_id', { mode: 'bigint' })
      .notNull()
      .references(() => whisperMessages.id, { onDelete: 'cascade' }),
    reporterUserId: uuid('reporter_user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.messageId, t.reporterUserId] })],
);

/** 읽음 포인터 + '대화 나가기'(내 쪽만 숨김 — 상대 기록·어드민 열람 유지). */
export const whisperReads = pgTable(
  'whisper_reads',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    serverId: smallint('server_id').notNull(),
    peerUserId: uuid('peer_user_id').notNull(),
    lastReadId: bigint('last_read_id', { mode: 'bigint' }).notNull().default(0n),
    /** 나가기 시점의 최신 메시지 id — 이 id 이하는 내 목록·스레드에서 제외. */
    hiddenBeforeId: bigint('hidden_before_id', { mode: 'bigint' }).notNull().default(0n),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.serverId, t.peerUserId] })],
);

export type ChatMessage = typeof chatMessages.$inferSelect;
export type WhisperMessage = typeof whisperMessages.$inferSelect;
