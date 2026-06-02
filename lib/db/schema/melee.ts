/**
 * SCHEMA §13. 대난투 (Grand Melee) — MELEE.md.
 *
 * 단일 글로벌 결정론 난투(룸 샤딩 없음). 매일 9시 산출(전투력 9시 스냅샷) →
 * 9:30 발표. 랭킹은 전체 시뮬로 결정, 리플레이는 피날레(마지막 N명 구간)만 저장.
 * 멱등: battle_date UNIQUE. 결과/순위 API는 status='revealed'(서버 시각) 전 비공개.
 */
import {
  pgTable,
  pgEnum,
  uuid,
  text,
  bigint,
  bigserial,
  integer,
  jsonb,
  timestamp,
  date,
  index,
  primaryKey,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

import { profiles } from './profiles';

export const meleeStatusEnum = pgEnum('melee_status', ['running', 'computed', 'revealed']);

/** 피날레 이벤트 1건 — 마지막 MELEE_FINALE_SIZE명 생존 구간만 보존(리플레이용). */
export type MeleeFinaleEvent = {
  /** 공격자 user_id */ a: string;
  /** 타겟 user_id */ t: string;
  /** 데미지 */ d: number;
  /** 이 타격으로 탈락했는지 */ k: boolean;
};
/** 피날레 페이로드 — 자기완결(닉네임·전투력 스냅샷 포함, 그날 리플레이 렌더용). */
export type MeleeFinale = {
  roster: { userId: string; nickname: string; cp: number }[];
  events: MeleeFinaleEvent[];
};

/** §13.1 melee_battles — 하루 1행. */
export const meleeBattles = pgTable('melee_battles', {
  id: bigserial('id', { mode: 'bigint' }).primaryKey(),
  /** KST 기준 날짜. 하루 1배틀 멱등 키. */
  battleDate: date('battle_date', { mode: 'string' }).notNull().unique(),
  /** 결정론 시드(날짜 파생). 동일 입력=동일 결과 재현. */
  seed: text('seed').notNull(),
  status: meleeStatusEnum('status').notNull().default('running'),
  participantCount: integer('participant_count').notNull().default(0),
  championUserId: uuid('champion_user_id').references(() => profiles.id),
  /** 리플레이용 피날레(roster+events). MeleeFinale. 비-피날레 구간은 저장 안 함. */
  finale: jsonb('finale').$type<MeleeFinale>().notNull().default(sql`'{"roster":[],"events":[]}'::jsonb`),
  computedAt: timestamp('computed_at', { withTimezone: true }),
  revealedAt: timestamp('revealed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/** §13.2 melee_participants — 참가자×배틀 1행(로스터=결과 통합). */
export const meleeParticipants = pgTable(
  'melee_participants',
  {
    battleId: bigint('battle_id', { mode: 'bigint' })
      .notNull()
      .references(() => meleeBattles.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    /** 9시 전투력 스냅샷. */
    cpSnapshot: bigint('cp_snapshot', { mode: 'bigint' }).notNull(),
    /** 최종 등수(1=우승). */
    finalRank: integer('final_rank').notNull(),
    /** 나를 탈락시킨 유저(마지막 일격). null = 챔피언(1위). */
    killerUserId: uuid('killer_user_id'),
    rewardDiamond: bigint('reward_diamond', { mode: 'bigint' }).notNull().default(sql`0`),
    rewardBoxes: jsonb('reward_boxes')
      .$type<{ weapon: number; armor: number; accessory: number }>()
      .notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.battleId, t.userId] }),
    index('melee_part_rank_idx').on(t.battleId, t.finalRank),
  ],
);

export type MeleeBattle = typeof meleeBattles.$inferSelect;
export type MeleeParticipant = typeof meleeParticipants.$inferSelect;
