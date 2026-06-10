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

/**
 * 리플레이 페이로드 — 마지막 MELEE_REPLAY_ROUNDS 라운드(총 라운드 적으면 전체).
 * 자기완결: roster(등장 유저 닉·전투력·등수 스냅샷) + events(roster 로컬 인덱스 압축).
 */
export type MeleeFinale = {
  /** 등장 유저 스냅샷(그 시점 닉·전투력·등수·아바타·길드문양). avatar는 **원본**(전투 재생용).
   *  guildEmblemUrl=그 시점 소속 길드 문양(현재가 아닌 당시). 스냅샷 도입 이후 배틀부터(이전은 live 폴백). */
  roster: {
    userId: string;
    nickname: string;
    cp: number;
    rank: number;
    avatar?: string | null;
    guildEmblemUrl?: string | null;
  }[];
  /** [공격자 로컬idx, 타겟 로컬idx, 데미지, 타겟 잔여HP] — 시간순. 잔여HP ≤ 0 = 탈락. */
  events: [number, number, number, number][];
  /** 우승자 트로피 아바타(우승컵 든 정면) — 포디움/우승카드 **표시 전용**. 전투 재생은 roster[].avatar(원본). */
  trophyAvatar?: string | null;
};

/**
 * "내 전투" 미니로그 1건 — 본인 관점.
 * [역할(0=내가 공격, 1=내가 피격), 상대 닉네임, 데미지, 타겟 잔여HP(≤0=탈락), 라운드].
 * 역할 0이면 잔여HP=상대, 1이면 잔여HP=나.
 */
export type MeleeMyEvent = [0 | 1, string, number, number, number];

/** §13.1 melee_battles — 하루 1행. */
export const meleeBattles = pgTable('melee_battles', {
  id: bigserial('id', { mode: 'bigint' }).primaryKey(),
  /** KST 기준 날짜. 하루 1배틀 멱등 키. */
  battleDate: date('battle_date', { mode: 'string' }).notNull().unique(),
  /** 결정론 시드(날짜 파생). 동일 입력=동일 결과 재현. */
  seed: text('seed').notNull(),
  status: meleeStatusEnum('status').notNull().default('running'),
  participantCount: integer('participant_count').notNull().default(0),
  /** 총 라운드 수 — finale 이벤트의 실제 라운드 번호 역산용. */
  totalRounds: integer('total_rounds').notNull().default(0),
  championUserId: uuid('champion_user_id').references(() => profiles.id),
  /** 리플레이용 피날레(roster+events). MeleeFinale. 비-피날레 구간은 저장 안 함. */
  finale: jsonb('finale').$type<MeleeFinale>().notNull().default(sql`'{"roster":[],"events":[]}'::jsonb`),
  computedAt: timestamp('computed_at', { withTimezone: true }),
  revealedAt: timestamp('revealed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),

  // ── 우승 트로피 아바타 자동 생성 파이프라인(MELEE §우승컵) ──
  /** null=미시작 / 'generating'=생성·폴링 중 / 'done'(우편 발송 완료) / 'failed'(상한 초과). */
  trophyStatus: text('trophy_status'),
  /** 현재 시도의 pixellab 캐릭터 id(생성 결과). */
  trophyCharId: text('trophy_char_id'),
  /** 포즈 태그(onehand/chest 등). */
  trophyPose: text('trophy_pose'),
  /** 생성 시도 횟수 — 재시도 상한(생성 실패/AI 미통과 시 재생성). */
  trophyAttempts: integer('trophy_attempts').notNull().default(0),
  /** 마지막 트로피 상태 전이 시각 — 'generating' 타임아웃 판정용. */
  trophyUpdatedAt: timestamp('trophy_updated_at', { withTimezone: true }),
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
    /** "내 전투" 미니로그 — 본인 관여 이벤트(MeleeMyEvent[]). 등수 무관 항상 조회용. */
    myEvents: jsonb('my_events').$type<MeleeMyEvent[]>().notNull().default(sql`'[]'::jsonb`),
    /** 총 공격 횟수(내가 공격자였던 라운드). */
    attackCount: integer('attack_count').notNull().default(0),
    /** 총 방어 횟수(내가 타겟이었던 라운드). */
    defenseCount: integer('defense_count').notNull().default(0),
  },
  (t) => [
    primaryKey({ columns: [t.battleId, t.userId] }),
    index('melee_part_rank_idx').on(t.battleId, t.finalRank),
  ],
);

export type MeleeBattle = typeof meleeBattles.$inferSelect;
export type MeleeParticipant = typeof meleeParticipants.$inferSelect;
