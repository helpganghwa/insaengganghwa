/**
 * SCHEMA §12. 세계역사(world_history) — SCREEN-ANALYSIS §4 사용자 결정(2026-05-25).
 *
 * 판타지 역사서 톤으로 모든 유저의 특별한 순간을 적재. 홈 wide 카드(최근 5건) +
 * /history 전체 페이지에서 노출. user_id NULLABLE — 운영자 공지/창세 시드 등 시스템 이벤트.
 *
 * 적재 정책: 자동 적재 + 닉네임 노출(공개 프로필 /u/[nickname]과 일관).
 * 운영 부담은 템플릿화로 0에 가까움 — 신규 이벤트 종류 추가 시 enum + 1줄 템플릿.
 */
import {
  pgTable,
  pgEnum,
  uuid,
  text,
  jsonb,
  bigserial,
  timestamp,
  index,
} from 'drizzle-orm/pg-core';

import { profiles } from './profiles';

export const worldEventTypeEnum = pgEnum('world_event_type', [
  'enhance_99',       // 강화 +99 도달 (instance 첫 도달)
  'transcend_max',    // 초월 T10 달성 (instance 첫 도달)
  'codex_complete',   // 도감 100% 완성 (user 첫 1회)
  'champion_new',     // (P1) 카탈로그 아이템 1위 변동 — 챔피언 교체
  'operator_notice',  // 운영자 공지 (admin form publish)
  'genesis',          // 창세 서사 시드 — 출시 시점 적재용
]);

export const worldHistory = pgTable(
  'world_history',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    /** 시스템 이벤트(operator_notice/genesis)는 NULL. */
    userId: uuid('user_id').references(() => profiles.id, { onDelete: 'set null' }),
    eventType: worldEventTypeEnum('event_type').notNull(),
    /** 이벤트별 메타데이터 — itemKo/levelReached 등 (UI 변환·필터·디버깅용). */
    payload: jsonb('payload').notNull(),
    /** 판타지 역사서 톤 한 문장 — 적재 시점 템플릿으로 생성(추후 재가공 X). */
    message: text('message').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // 최근순 정렬 핫패스(홈 카드·/history).
    index('world_history_created_idx').on(t.createdAt),
  ],
);

export type WorldHistory = typeof worldHistory.$inferSelect;
export type WorldEventType = (typeof worldEventTypeEnum.enumValues)[number];
