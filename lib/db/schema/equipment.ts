/**
 * SCHEMA §2. 카탈로그 & 장비 (카탈로그당 1레코드)
 *
 * 등급/희소성/부가스탯 없음. 모든 카탈로그 아이템 성능 동일 — 슬롯 구분 + 외관 +
 * 초월 동일성 판정용(GDD §3.1). 강함 = 강화 레벨 + 초월 레벨뿐.
 * 카탈로그 종수는 가변(지속 추가) — 박스 확률은 균등 규칙(BALANCE §4.2).
 *
 * 장비는 **인스턴스 더미가 아니라 카탈로그당 1레코드**(user_equipment). 같은 카탈로그
 * 중복 획득은 보관되지 않고 초월 진행도(transcend_progress)로 누적 → 자동 초월.
 */
import {
  pgTable,
  smallint,
  pgEnum,
  uuid,
  text,
  integer,
  boolean,
  serial,
  bigserial,
  timestamp,
  index,
  uniqueIndex,
  check,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

import { profiles } from './profiles';

/** 슬롯 — 무기/방어구/장신구 3종 고정 (보급 상자 슬롯 일치 키). */
export const slotEnum = pgEnum('slot', ['weapon', 'armor', 'accessory']);
export type Slot = (typeof slotEnum.enumValues)[number];

/** §2.1 catalog_items — 가변 카탈로그. 성능 컬럼 없음. */
export const catalogItems = pgTable('catalog_items', {
  id: serial('id').primaryKey(),
  slot: slotEnum('slot').notNull(),
  /** 스프라이트/식별 키 (예: sword_iron). */
  code: text('code').notNull().unique(),
  name: text('name').notNull(),
  /** 비활성 시 신규 드롭 제외 (균등 확률 = 1/활성 종수). */
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * §2.2 user_equipment — 유저가 보유한 카탈로그 아이템 1종당 1레코드.
 *
 * 강화·초월은 카탈로그 단위(같은 카탈로그를 여러 레벨로 복수 보유하는 개념 없음).
 * 중복 획득(박스) = transcend_progress 누적 → 임계 도달 시 자동 초월(BALANCE §2).
 * max_* = lifetime 최고(분해·소모 없으니 곧 현재값과 동일하나, 배틀패스/랭킹 단조 키로 유지).
 */
export const userEquipment = pgTable(
  'user_equipment',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    /** 소속 서버(SERVER.md P3b) — 캐릭터 단위 스코프. */
    serverId: smallint('server_id').notNull().default(1),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    catalogItemId: integer('catalog_item_id')
      .notNull()
      .references(() => catalogItems.id),
    /** 현재 강화 레벨 (순수 시간/RNG, 제물 없음). */
    enhanceLevel: integer('enhance_level').notNull().default(0),
    /** 현재 초월 레벨 (자동 초월, 무한). */
    transcendLevel: integer('transcend_level').notNull().default(0),
    /** 다음 초월까지 누적된 중복 수. 임계(선형 T→T+1 = T+1개) 도달 시 소진+레벨업. */
    transcendProgress: integer('transcend_progress').notNull().default(0),
    /** 역대 최고 강화(lifetime) — 배틀패스/아이템별 랭킹 단조 키. */
    maxEnhanceLevel: integer('max_enhance_level').notNull().default(0),
    /** 현재 max_enhance_level 최초 달성 시각 — 랭킹 동률 타이브레이크. */
    maxEnhanceReachedAt: timestamp('max_enhance_reached_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    /** 역대 최고 초월(lifetime). */
    maxTranscendLevel: integer('max_transcend_level').notNull().default(0),
    maxTranscendReachedAt: timestamp('max_transcend_reached_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    /** 장착 슬롯(외형 전용, 전투력 무관) / 미장착 null. */
    equippedSlot: slotEnum('equipped_slot'),
    /** 도감 해금(획득) 시각. */
    firstAcquiredAt: timestamp('first_acquired_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // 카탈로그당 1레코드.
    uniqueIndex('ue_user_catalog_uq').on(t.userId, t.serverId, t.catalogItemId),
    // 슬롯 그리드/장착 조회.
    index('ue_user_slot_idx').on(t.userId, t.equippedSlot).where(sql`${t.equippedSlot} is not null`),
    // 최고강화자 셀프조인(championCatalogIds/liberatedItemRanks NOT EXISTS) — 0026 수동 적용.
    index('ue_catalog_rank_idx')
      .on(t.catalogItemId, t.maxEnhanceLevel, t.maxEnhanceReachedAt, t.userId)
      .where(sql`${t.maxEnhanceLevel} > 0`),
    // 강화/초월 0 이상.
    check('ue_enhance_min', sql`${t.enhanceLevel} >= 0`),
    check('ue_transcend_min', sql`${t.transcendLevel} >= 0`),
    check('ue_transcend_progress_min', sql`${t.transcendProgress} >= 0`),
  ],
);

export type CatalogItem = typeof catalogItems.$inferSelect;
export type UserEquipment = typeof userEquipment.$inferSelect;
