/**
 * SCHEMA §2. 카탈로그 & 장비 & 도감
 *
 * 등급/희소성/부가스탯 없음. 모든 카탈로그 아이템 성능 동일 — 슬롯 구분 + 외관 +
 * 도감 + 초월 동일성 판정용(GDD §3.1). 강함 = 강화 레벨 + 초월 레벨뿐.
 * 카탈로그 종수는 가변(지속 추가) — 박스 확률은 균등 규칙(BALANCE §4.2).
 */
import {
  pgTable,
  pgEnum,
  uuid,
  text,
  integer,
  smallint,
  boolean,
  serial,
  bigserial,
  timestamp,
  index,
  uniqueIndex,
  primaryKey,
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

/** §2.2 equipment_instances — 장비 개체. 등급/옵션/seed/전투력 컬럼 없음. */
export const equipmentInstances = pgTable(
  'equipment_instances',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    /** 초월/+100 제물 동일성 = 이 값 일치 (강화·초월 레벨 무관). */
    catalogItemId: integer('catalog_item_id')
      .notNull()
      .references(() => catalogItems.id),
    enhanceLevel: integer('enhance_level').notNull().default(0),
    /** 0..10 (BALANCE §2, MAX_TRANSCEND). */
    transcendLevel: smallint('transcend_level').notNull().default(0),
    /** 장착 시 해당 슬롯, 미장착 null. */
    equippedSlot: slotEnum('equipped_slot'),
    isLocked: boolean('is_locked').notNull().default(false),
    acquiredAt: timestamp('acquired_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // 슬롯당 1개 장착 — 부분 UNIQUE.
    uniqueIndex('eq_user_equipped_slot_uq')
      .on(t.userId, t.equippedSlot)
      .where(sql`${t.equippedSlot} is not null`),
    // 제물 후보/중복 조회.
    index('eq_user_catalog_idx').on(t.userId, t.catalogItemId),
    index('eq_user_equipped_idx').on(t.userId, t.equippedSlot),
    check('transcend_level_range', sql`${t.transcendLevel} between 0 and 10`),
  ],
);

/** §2.3 user_codex — 도감(획득+최고 강화). 도감강화합 = Σ max_enhance_level. */
export const userCodex = pgTable(
  'user_codex',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    catalogItemId: integer('catalog_item_id')
      .notNull()
      .references(() => catalogItems.id),
    /** 해당 아이템 역대 최고 강화. 총 전투력·합산 강화 랭킹 소스(BALANCE §3.2/3.3). */
    maxEnhanceLevel: integer('max_enhance_level').notNull().default(0),
    /**
     * 현재 max_enhance_level을 **최초 달성한 시각**. 아이템별 랭킹 동률 타이브레이크
     * (먼저 달성한 유저 우선, BALANCE §3.3 / SCHEMA §2.3). 신규레벨 > 기존 max일
     * 때만 now()로 갱신(이후 하락·재달성과 무관). 신규 row insert 시 default now().
     */
    maxEnhanceReachedAt: timestamp('max_enhance_reached_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    /** 도감 해금(미획득 = row 없음). */
    firstAcquiredAt: timestamp('first_acquired_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.catalogItemId] })],
);

export type CatalogItem = typeof catalogItems.$inferSelect;
export type EquipmentInstance = typeof equipmentInstances.$inferSelect;
export type UserCodex = typeof userCodex.$inferSelect;
