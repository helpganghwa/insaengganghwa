/**
 * SCHEMA §10. 운영 / 감사 / 안티치트
 *
 * 확률공시 스냅샷(게임산업법 §33, 변경 시 영구 기록+24h 사전), 점검 모드,
 * 운영 감사 로그. 레이트리밋은 Upstash(DB 아님).
 */
import {
  pgTable,
  pgEnum,
  uuid,
  text,
  bigserial,
  integer,
  boolean,
  jsonb,
  timestamp,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const systemModeValueEnum = pgEnum('system_mode_value', [
  'live',
  'read_only',
  'maintenance',
  'emergency_stop',
]);

/** §10.1 probability_snapshots — 확률/수치 공시 전문 영구 기록. */
export const probabilitySnapshots = pgTable('probability_snapshots', {
  id: bigserial('id', { mode: 'bigint' }).primaryKey(),
  effectiveAt: timestamp('effective_at', { withTimezone: true }).notNull(),
  /** baseRate 표·보급 균등 규칙·환산률 등 공시 전문. */
  payload: jsonb('payload').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/** §10.2 system_mode — 단일 행(key='global'). 점검/긴급정지 킬스위치(lib/game/system-mode.ts). */
export const systemMode = pgTable('system_mode', {
  key: text('key').primaryKey().default('global'),
  mode: systemModeValueEnum('mode').notNull().default('live'),
  /** 점검 시작 예정(null=즉시). 도래 전엔 비활성. */
  scheduledFrom: timestamp('scheduled_from', { withTimezone: true }),
  /** 점검 종료 예정(null=무기한). 지나면 자동으로 live 간주. */
  scheduledUntil: timestamp('scheduled_until', { withTimezone: true }),
  note: text('note'),
  updatedBy: uuid('updated_by'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// §10.3 ad_views — 광고 보상 v1 미도입. 향후 SSV 지원 광고 환경 도입 시 재검토.

/**
 * §10.5 client_errors — 클라이언트 전역 에러 수집(/api/client-error).
 *
 * fingerprint(kind:message)로 그룹화 — 동일 에러는 count 증가(테이블 폭주 방지). 미해결 동일
 * fingerprint는 부분 유니크로 1행. 어드민 /admin/client-errors에서 조회·해결.
 */
export const clientErrors = pgTable(
  'client_errors',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    /** kind:message 정규화 키 — 그룹 식별. */
    fingerprint: text('fingerprint').notNull(),
    kind: text('kind').notNull(),
    message: text('message').notNull(),
    url: text('url'),
    ua: text('ua'),
    stack: text('stack'),
    /** 동일 fingerprint 발생 횟수. */
    count: integer('count').notNull().default(1),
    resolved: boolean('resolved').notNull().default(false),
    firstSeen: timestamp('first_seen', { withTimezone: true }).notNull().defaultNow(),
    lastSeen: timestamp('last_seen', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('client_errors_open_uq').on(t.fingerprint).where(sql`${t.resolved} = false`),
    index('client_errors_open_idx').on(t.resolved, t.lastSeen),
  ],
);

/**
 * §10.6 cron_heartbeats — 크론 dead-man. 각 크론이 성공 시 last_success_at 갱신(beatCron).
 * warm 워치독·어드민 대시보드가 크론별 허용 간격 초과를 정지로 감지(lib/cron/heartbeat.ts).
 */
export const cronHeartbeats = pgTable('cron_heartbeats', {
  name: text('name').primaryKey(),
  lastSuccessAt: timestamp('last_success_at', { withTimezone: true }).notNull().defaultNow(),
  detail: text('detail'),
  /** 정지 알림 디듀프 — warm 워치독이 알림 시각 기록, beatCron 회복 시 null. */
  staleAlertedAt: timestamp('stale_alerted_at', { withTimezone: true }),
});

/** §10.4 admin_actions — 운영 감사 로그. */
export const adminActions = pgTable('admin_actions', {
  id: bigserial('id', { mode: 'bigint' }).primaryKey(),
  adminUserId: uuid('admin_user_id').notNull(),
  action: text('action').notNull(),
  targetType: text('target_type'),
  targetId: text('target_id'),
  payload: jsonb('payload'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
