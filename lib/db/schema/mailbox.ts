/**
 * SCHEMA §7. 우편함 (인게임 인박스)
 *
 * 비동기 보상(보급·대난투)·운영 공지·길드/점령전 알림·프로필 검토 결과 적재
 * (lazy + cron 멱등, CLAUDE §3.4).
 *
 * v1 확장(2026-05-20): 운영자 메일(admin) + 만료(7일 통일) + 제목/본문/발신자
 * 라벨 + 감사 로그(mail_claim_logs). 챔피언 자동 보상은 도입 안 함(사용자 결정).
 */
import {
  pgTable,
  smallint,
  pgEnum,
  uuid,
  bigint,
  bigserial,
  date,
  integer,
  jsonb,
  primaryKey,
  text,
  timestamp,
  index,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

import { profiles } from './profiles';

export const mailboxTypeEnum = pgEnum('mailbox_type', [
  /** 보상(일일 보급·프리미엄·추천인·개발 지급). */
  'reward',
  /** 운영 공지(범용). */
  'notice',
  /** 운영자 수동 발송(어드민 대시보드). */
  'admin',
  /** 프로필 자동 검토 통과 — 목록 추가 안내(PROFILE §5.4). */
  'profile_accepted',
  /** 프로필 AI 검토 거절 — 다이아 환불 + 사유 통지. */
  'profile_rejected_ai',
  /** 프로필 시스템 장애 환불 — Anthropic/Pixellab 재시도 다 실패. */
  'profile_failed',
  /** 대난투 결과 보상. */
  'melee',
  /** 점령전 결과 통지. */
  'conquest',
  /** 길드 알림(길드장 위임 등). */
  'guild',
  /** 예약·미사용(inert) — 강화 결과는 인페이지 토스트+완료 푸시로 통지, 우편 미사용(0087로 DB에 값만 존재). */
  'enhance_result',
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
    /** 소속 서버(SERVER.md P3b) — 보상이 서버 지갑/상자로 귀속. */
    serverId: smallint('server_id').notNull().default(1),
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
    // 미수령·미만료 메일 빠른 조회용 partial index. 라이브 SQL(0003)과 동일하게 부분조건 명시
    // (누락 시 drizzle-kit이 부분→비부분으로 재생성해 배지 쿼리 퇴화).
    index('mailbox_user_unclaimed_idx').on(t.userId, t.expiresAt).where(sql`${t.claimedAt} is null`),
  ],
);

export type Mail = typeof mailbox.$inferSelect;

/**
 * 우편 수령 감사 — claim 시 다이아/박스 분배 결과 append-only.
 * mailbox.claimedAt이 멱등 게이트, 이 로그는 분배 감사·복구용.
 */
export const mailClaimLogs = pgTable('mail_claim_logs', {
  id: bigserial('id', { mode: 'bigint' }).primaryKey(),
  /** 소속 서버(SERVER.md P3b). */
  serverId: smallint('server_id').notNull().default(1),
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
 * 어드민 발송 감사 로그 — 누가/언제/무엇을 발송했는지 append-only 기록.
 * mailbox 행만으로는 운영 추적이 어려워 별도 적재(5년 운영 + 재화 지급 안전망).
 * admin_id는 발송자 삭제 시에도 로그 보존 위해 set null.
 */
export const adminMailLogs = pgTable(
  'admin_mail_logs',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    adminId: uuid('admin_id').references(() => profiles.id, { onDelete: 'set null' }),
    /** 'one' | 'broadcast'. */
    mode: text('mode').notNull(),
    /** 실제 발송된 수신자 수(broadcast는 inserted, 단건은 1). */
    recipientCount: integer('recipient_count').notNull().default(0),
    /** 단건: 닉네임/userId, broadcast: '전체'. 가독용 라벨. */
    targetLabel: text('target_label').notNull().default(''),
    title: text('title').notNull().default(''),
    body: text('body').notNull().default(''),
    /** clampPayload 결과(다이아/상자). */
    payload: jsonb('payload').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('admin_mail_logs_created_idx').on(t.createdAt)],
);

export type AdminMailLog = typeof adminMailLogs.$inferSelect;

/**
 * 일일 보급 — 매일 KST 자정 기준 1회 자동 발송 멱등 가드.
 * PK (user_id, server_id, kst_day)로 동시·중복 발송 차단(서버별 1회). 메일 자체는 mailbox에 별도 적재.
 * ensureDailyMail()이 lazy 호출 — Cron 의존 X.
 */
export const dailySupplyGrants = pgTable(
  'daily_supply_grants',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    /** 소속 서버(SERVER.md P3b). */
    serverId: smallint('server_id').notNull().default(1),
    /** Asia/Seoul 기준 날짜. KST 자정에 갱신. */
    kstDay: date('kst_day', { mode: 'string' }).notNull(),
    grantedAt: timestamp('granted_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.serverId, t.kstDay] })],
);

/**
 * 성장 프리미엄 일일 보상 멱등(0068) — daily_supply_grants와 동일 패턴, 별개 채널.
 * ensurePremiumDailyMail()이 활성 프리미엄 보유자에게 KST 자정 1회 일일 보상 우편 발송.
 */
export const premiumDailyGrants = pgTable(
  'premium_daily_grants',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    serverId: smallint('server_id').notNull().default(1),
    kstDay: date('kst_day', { mode: 'string' }).notNull(),
    grantedAt: timestamp('granted_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.serverId, t.kstDay] })],
);

