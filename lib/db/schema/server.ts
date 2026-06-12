import { sql } from 'drizzle-orm';
import {
  pgTable,
  smallint,
  text,
  timestamp,
  uuid,
  primaryKey,
  index,
  bigint,
  integer,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

import { profiles } from './profiles';

/**
 * 서버(논리 월드) — SERVER.md. 단일 DB 안에서 server_id로 게임 월드 분리.
 * 계정(카카오·결제·닉네임)은 전역, 캐릭터(게임 진행·다이아 지갑)는 서버별.
 */
export const servers = pgTable('servers', {
  id: smallint('id').primaryKey(),
  name: text('name').notNull(),
  /** open(정상) | full(신규 캐릭터 생성 제한) | closed(준비/통합 대비) */
  status: text('status').notNull().default('open'),
  openedAt: timestamp('opened_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * 캐릭터 — 계정과 분리된 서버별 진행 단위(SERVER.md §2). 1계정 = 서버당 1캐릭터.
 * 서버별 스칼라 상태(다이아 지갑·거주지·튜토리얼)는 SERVER.md §5 단계에 따라 이관된다.
 */
export const characters = pgTable(
  'characters',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    serverId: smallint('server_id')
      .notNull()
      .references(() => servers.id),
    /** 서버별 다이아 지갑(P2 이관) — 증감은 lib/game/wallet.ts 단일 경로로만. */
    diamond: bigint('diamond', { mode: 'bigint' }).notNull().default(sql`0`),
    /** 캐릭터 닉네임(P3 이관) — **전 캐릭터 전역 유일**(같은 계정도 재사용 불가, SERVER.md §1). */
    nickname: text('nickname').notNull(),
    /** 닉변 횟수(캐릭터별) — 0이면 첫 변경 무료. */
    nicknameChangedCount: integer('nickname_changed_count').notNull().default(0),
    /** 튜토리얼 단계(캐릭터별). */
    tutorialStep: integer('tutorial_step').notNull().default(0),
    /** 거주 구역(세금 귀속, GUILD §5.5) — null=미설정. */
    residenceZoneId: integer('residence_zone_id'),
    /** 마지막 활동(캐릭터별) — 친구 표시·길드장 7일 자동위임 판정. */
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
    /** 활성 아바타(user_profiles.id, P6 이관) — null=기본 아이콘 폴백. FK는 0061 ALTER. */
    activeProfileId: uuid('active_profile_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.serverId] }),
    index('characters_server_idx').on(t.serverId),
    uniqueIndex('characters_nickname_uq').on(t.nickname),
    index('characters_residence_idx').on(t.residenceZoneId),
  ],
);
