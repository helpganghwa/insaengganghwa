/**
 * 도전 과제(일회성 온보딩 리워드, 0118) — 2026-07-14.
 * 달성 판정은 대부분 기존 테이블 상태 파생(lib/game/challenges/status.ts). 상태 흔적이
 * 없는 행위(앱 실행·자랑 공유·거주 이동·아바타 변경)만 challenge_events에 마킹.
 * 수령 = challenge_claims (유저·서버·과제 PK = 멱등, 지급액 스냅샷 보존).
 */
import { pgTable, uuid, smallint, text, bigint, jsonb, timestamp, primaryKey } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const challengeEvents = pgTable(
  'challenge_events',
  {
    userId: uuid('user_id').notNull(),
    serverId: smallint('server_id').notNull(),
    eventId: text('event_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.serverId, t.eventId] })],
);

export const challengeClaims = pgTable(
  'challenge_claims',
  {
    userId: uuid('user_id').notNull(),
    serverId: smallint('server_id').notNull(),
    challengeId: text('challenge_id').notNull(),
    /** 지급 스냅샷(감사) — 수령 시점 보상. 정의가 바뀌어도 이력 보존. */
    diamond: bigint('diamond', { mode: 'bigint' }).notNull().default(sql`0`),
    boxes: jsonb('boxes').notNull().default(sql`'{}'::jsonb`),
    claimedAt: timestamp('claimed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.serverId, t.challengeId] })],
);
