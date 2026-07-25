import {
  bigint,
  bigserial,
  boolean,
  index,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

import type { AnnouncementPoll } from '@/lib/game/announcement-shared';

import { profiles } from './profiles';

/**
 * §20 announcements — 전역 공지사항(게시판). 어드민 작성·발행, 유저는 홈 게시판 카드/강제 팝업으로 열람.
 *
 * 우편함(개인 보상)과 분리 — 전체 대상 읽기전용 게시물(영구 보관·카테고리·고정핀). 본문은 마크다운
 * (MarkdownView, 신뢰된 어드민 입력). 발행(published=true) + published_at로 노출·정렬.
 */
export const announcements = pgTable(
  'announcements',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    /** notice|maintenance|update|event|policy|probability */
    category: text('category').notNull().default('notice'),
    title: text('title').notNull(),
    /** 마크다운 본문 — 어드민 신뢰 입력. */
    body: text('body').notNull(),
    /** 목록 상단 고정. */
    pinned: boolean('pinned').notNull().default(false),
    /** 발행 여부(초안 가능). false면 유저 비노출. */
    published: boolean('published').notNull().default(false),
    /** 최초 발행 시각 — 노출/정렬 기준(재편집해도 유지). */
    publishedAt: timestamp('published_at', { withTimezone: true }),
    /** 투표(선택) — {question, options[], closesAtIso?}. 결과는 관리자만, 유저는 투표만. null=투표 없음. */
    poll: jsonb('poll').$type<AnnouncementPoll>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('announcements_pub_idx').on(t.published, t.publishedAt)],
);

/**
 * 공지 투표 — 1인 1표(PK=공지×유저, 변경=update). 결과·투표자는 **관리자만** 열람(유저 집계 미노출).
 * ⚠ 마이그레이션(0134) 미적용 시 inert.
 */
export const announcementPollVotes = pgTable(
  'announcement_poll_votes',
  {
    announcementId: bigint('announcement_id', { mode: 'bigint' })
      .notNull()
      .references(() => announcements.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    optionId: text('option_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.announcementId, t.userId] }),
    index('announcement_poll_votes_ann_idx').on(t.announcementId),
  ],
);
