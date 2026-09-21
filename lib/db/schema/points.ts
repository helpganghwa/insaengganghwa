import { bigint, bigserial, index, pgTable, primaryKey, smallint, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

import { profiles } from './profiles';

/**
 * 포인트 원장(0197, docs/POINT-SHOP.md) — 대난투 포인트·마일리지 공용. 잔액은 characters.melee_points·
 * mileage_wallets.balance(둘 다 서버별, 0211)에 캐시하고, 이 원장이 정본. (kind, ref) 부분 유니크가 멱등 키.
 */
export const pointLedger = pgTable(
  'point_ledger',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    /** 그 점수가 속한 서버 — 대난투는 전투 서버, 마일리지는 결제한 서버(0211부터. 그 전 행은 0211이 채웠다). */
    serverId: smallint('server_id'),
    kind: text('kind').$type<'melee' | 'mileage'>().notNull(),
    delta: bigint('delta', { mode: 'bigint' }).notNull(),
    /** 화면 표기용 한 줄(예: '대난투 4위', '다이아 충전 ₩28,000', '환불 회수'). */
    note: text('note').notNull().default(''),
    /** 멱등 키 — 'melee:<battle>:<user>' | 'order:<id>' | 'order:<id>:refund'. */
    ref: text('ref'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('point_ledger_user_kind_idx').on(t.userId, t.kind, t.createdAt)],
);

/**
 * 마일리지 지갑(0211) — 서버별 잔액 캐시. characters에 두지 않는 이유: 결제·환불 트랜잭션의 잠금 순서
 * (iap_orders → monthly_purchase_limits → **마일리지** → battlepass → characters)를 지키기 위해서다.
 * characters 행에 두면 환불이 characters를 battlepass보다 먼저 잠가 배틀패스 수령과 교착이 난다.
 */
export const mileageWallets = pgTable(
  'mileage_wallets',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    serverId: smallint('server_id').notNull(),
    balance: bigint('balance', { mode: 'bigint' }).notNull().default(sql`0`),
  },
  (t) => [primaryKey({ columns: [t.userId, t.serverId] })],
);
