import { bigint, bigserial, index, integer, pgTable, primaryKey, smallint, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

import { profiles } from './profiles';

/**
 * §22 할로윈 이벤트 — 사탕(강화 성공 적립). 0247, 추석(0213)과 같은 구조. 서버별(캐릭터 자원과 같은 귀속).
 *
 * - 지갑: total(누적, 도달 보상 기준)·spent(교환에 쓴). 사용 가능 = total − spent.
 * - 원장: 적립은 ref='job:<enhancement_job_id>'로 멱등(수령 사후처리가 두 번 돌아도 한 번만),
 *   교환은 ref='ex:<uuid>'. 원장이 정본, 지갑은 캐시(둘 다 같은 트랜잭션에서 갱신).
 * - 수령: (user, server, step) PK가 멱등 키 — 같은 단계는 한 번만.
 */
export const halloweenCandy = pgTable(
  'halloween_candy',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    serverId: smallint('server_id').notNull(),
    total: bigint('total', { mode: 'bigint' }).notNull().default(0n),
    spent: bigint('spent', { mode: 'bigint' }).notNull().default(0n),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.serverId] })],
);

export const halloweenCandyLedger = pgTable(
  'halloween_candy_ledger',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    serverId: smallint('server_id').notNull(),
    /** 'earn' 적립(+) | 'exchange' 교환 차감(−). */
    kind: text('kind').notNull(),
    delta: bigint('delta', { mode: 'bigint' }).notNull(),
    note: text('note').notNull().default(''),
    ref: text('ref'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('halloween_candy_ledger_ref_uq').on(t.ref),
    index('halloween_candy_ledger_user_idx').on(t.userId, t.serverId, t.createdAt),
  ],
);

export const halloweenCandyClaims = pgTable(
  'halloween_candy_claims',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    serverId: smallint('server_id').notNull(),
    step: smallint('step').notNull(),
    diamond: bigint('diamond', { mode: 'bigint' }).notNull(),
    boxes: integer('boxes').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.serverId, t.step] })],
);

/** 할로윈 강화 대회 정산 결과(0247) — 아이템별·서버별 1~10등. 어드민 정산이 한 번에 넣고 우편·칭호를 지급한다. */
export const halloweenContestResults = pgTable(
  'halloween_contest_results',
  {
    serverId: smallint('server_id').notNull(),
    catalogCode: text('catalog_code').notNull(),
    rank: smallint('rank').notNull(),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    level: integer('level').notNull(),
    reachedAt: timestamp('reached_at', { withTimezone: true }),
    diamond: bigint('diamond', { mode: 'bigint' }).notNull(),
    boxes: integer('boxes').notNull(),
    titles: text('titles').array().notNull().default([]),
    settledAt: timestamp('settled_at', { withTimezone: true }).notNull().defaultNow(),
    settledBy: uuid('settled_by'),
  },
  (t) => [primaryKey({ columns: [t.serverId, t.catalogCode, t.rank] }), index('halloween_contest_results_user_idx').on(t.userId, t.serverId)],
);
