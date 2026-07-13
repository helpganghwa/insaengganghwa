/**
 * SCHEMA — 고객센터 문의 (인앱 접수 → 관리자 답변).
 *  - 유저가 인앱 폼으로 접수(외부 메일 X) → 접수 안내 우편(운영자, 푸시 없음).
 *  - 관리자 페이지에서 답변 작성 → 답변 우편(운영자) + 앱 푸시(category 'admin', 항상 발송).
 * ⚠ 마이그레이션(lib/db/manual/0090) 미적용 시 inert.
 */
import {
  pgTable,
  bigserial,
  smallint,
  uuid,
  text,
  jsonb,
  timestamp,
  pgEnum,
  index,
} from 'drizzle-orm/pg-core';

import { profiles } from './profiles';

/** 문의 유형. */
export const supportInquiryTypeEnum = pgEnum('support_inquiry_type', [
  'payment', // 결제·환불
  'bug', // 버그·오류
  'account', // 계정·로그인
  'etc', // 건의·기타
]);

/** 문의 상태. */
export const supportInquiryStatusEnum = pgEnum('support_inquiry_status', ['open', 'answered']);

export const supportInquiries = pgTable(
  'support_inquiries',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    /** 접수 서버(SERVER.md) — 답변 우편이 그 서버 우편함으로. */
    serverId: smallint('server_id').notNull().default(1),
    type: supportInquiryTypeEnum('type').notNull(),
    /** 문의 내용. */
    body: text('body').notNull(),
    status: supportInquiryStatusEnum('status').notNull().default('open'),
    /** 관리자 답변(미답변 null). */
    answerBody: text('answer_body'),
    answeredByUserId: uuid('answered_by_user_id'),
    answeredAt: timestamp('answered_at', { withTimezone: true }),
    /** 접수 시점 닉네임·#코드 스냅샷 — 닉 변경돼도 관리자 식별. */
    contextSnapshot: jsonb('context_snapshot').notNull().default({}),
    /** 첨부 이미지 스토리지 경로(0116) — private 버킷 inquiry-attachments, 어드민은 signed URL 열람. */
    imagePaths: text('image_paths').array().notNull().default([]),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // 관리자 목록 — 미답변 우선·최신순.
    index('support_inquiries_status_created_idx').on(t.status, t.createdAt.desc()),
    index('support_inquiries_user_idx').on(t.userId),
  ],
);
export type SupportInquiry = typeof supportInquiries.$inferSelect;
