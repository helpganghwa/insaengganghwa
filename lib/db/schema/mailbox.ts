/**
 * SCHEMA §7. 우편함 (인게임 인박스)
 *
 * 오프라인 완료 강화 결과 · 레이드 6h 정산 · 비동기 보상 · 운영 공지 적재
 * (lazy + cron 멱등, CLAUDE §3.4). "광고 → 우편 즉시 수령"으로 가속(GDD §3.7).
 *
 * v1 확장(2026-05-20): 운영자 메일(admin) + 만료(30일 통일) + 제목/본문/발신자
 * 라벨 + 감사 로그(mail_claim_logs). 챔피언 자동 보상은 도입 안 함(사용자 결정).
 */
import {
  pgTable,
  pgEnum,
  uuid,
  bigint,
  bigserial,
  date,
  jsonb,
  primaryKey,
  text,
  timestamp,
  index,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

import { profiles } from './profiles';

export const mailboxTypeEnum = pgEnum('mailbox_type', [
  'enhance_result',
  'raid_settlement',
  'reward',
  'notice',
  /** 운영자 수동 발송(어드민 대시보드). */
  'admin',
]);

/**
 * payload jsonb 형태(v1): `{ diamond?: string|number, boxes?: { weapon?, armor?, accessory? } }`.
 * 다이아는 큰 수 안전을 위해 string 인용 권장(client는 bigint 변환).
 * 첨부 종류는 v1에서 다이아 + 슬롯별 상자만(사용자 결정).
 */
export const mailbox = pgTable(
  'mailbox',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    type: mailboxTypeEnum('type').notNull(),
    /** UI 카드 제목(짧게). 시스템 알림은 빈 string 허용. */
    title: text('title').notNull().default(''),
    /** 본문(긴 설명·markdown 가능). 빈 string 허용. */
    body: text('body').notNull().default(''),
    /** UI 노출용 발신자 라벨 — '운영자' / '시스템' / '챔피언 시스템' 등. */
    senderLabel: text('sender_label').notNull().default('시스템'),
    /** 다이아/보급상자(slot)/아이템/문구 등 — 타입별 payload(v1: 다이아+상자). */
    payload: jsonb('payload').notNull(),
    /** 수령 시각(null = 미수령). claim transition의 멱등 키. */
    claimedAt: timestamp('claimed_at', { withTimezone: true }),
    /** 만료 시각(default = sentAt + 30일, 통일). 만료 시 수령 불가. */
    expiresAt: timestamp('expires_at', { withTimezone: true })
      .notNull()
      .default(sql`now() + interval '30 days'`),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('mailbox_user_claimed_idx').on(t.userId, t.claimedAt),
    // 미수령·미만료 메일 빠른 조회용 partial index.
    index('mailbox_user_unclaimed_idx').on(t.userId, t.expiresAt),
  ],
);

export type Mail = typeof mailbox.$inferSelect;

/**
 * 우편 수령 감사 — claim 시 다이아/박스 분배 결과 append-only.
 * mailbox.claimedAt이 멱등 게이트, 이 로그는 분배 감사·복구용.
 */
export const mailClaimLogs = pgTable('mail_claim_logs', {
  id: bigserial('id', { mode: 'bigint' }).primaryKey(),
  mailId: bigint('mail_id', { mode: 'bigint' })
    .notNull()
    .references(() => mailbox.id, { onDelete: 'set null' }),
  userId: uuid('user_id')
    .notNull()
    .references(() => profiles.id, { onDelete: 'cascade' }),
  diamondGranted: bigint('diamond_granted', { mode: 'bigint' }).notNull().default(sql`0`),
  /** 슬롯별 박스 지급(jsonb: { weapon?, armor?, accessory? }). 모두 0이면 '{}'. */
  boxesGranted: jsonb('boxes_granted').notNull().default(sql`'{}'::jsonb`),
  claimedAt: timestamp('claimed_at', { withTimezone: true }).notNull().defaultNow(),
});

export type MailClaimLog = typeof mailClaimLogs.$inferSelect;

/**
 * 일일 보급 — 매일 KST 자정 기준 1회 자동 발송 멱등 가드.
 * PK (user_id, kst_day)로 동시·중복 발송 차단. 메일 자체는 mailbox에 별도 적재.
 * ensureDailyMail()이 lazy 호출 — Cron 의존 X.
 */
export const dailySupplyGrants = pgTable(
  'daily_supply_grants',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    /** Asia/Seoul 기준 날짜. KST 자정에 갱신. */
    kstDay: date('kst_day', { mode: 'string' }).notNull(),
    grantedAt: timestamp('granted_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.kstDay] })],
);

