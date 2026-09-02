import { sql } from 'drizzle-orm';
import {
  bigint,
  bigserial,
  index,
  jsonb,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

/**
 * §19 world_events — 서버 전체(월드) 주목 사건 피드(홈 하단 WorldLogFeed).
 *
 * 길드 audit_log의 월드판. 발생 시점 append-only(길드원 여부 무관 전체 유저). type별 detail
 * 스키마·렌더는 lib/game/world/event.ts·app/(game)/WorldLogFeed.tsx. 홈에선 server_id 최신순
 * limit으로 가볍게 1쿼리(feed_idx).
 */
export const worldEvents = pgTable(
  'world_events',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    serverId: smallint('server_id').notNull().default(1),
    /** 사건 종류 — melee_rank|enhance|transcend|guild_create|guild_power_1|guild_zone_1|rank_leader */
    type: text('type').notNull(),
    /** 주체 유저(있으면 프로필 링크). 길드 단위 사건은 null + detail.guildName. */
    actorUserId: uuid('actor_user_id'),
    /** 길드 단위 사건의 길드 id(표시는 detail.guildName 우선). */
    guildId: bigint('guild_id', { mode: 'bigint' }),
    detail: jsonb('detail'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('world_events_feed_idx').on(t.serverId, t.createdAt)],
);

/**
 * §19 ranking_leaders — 메트릭별 현재 1위 유저 추적(랭킹 1위 교체 감지용).
 *
 * 랭킹은 읽기 시점 계산이라 "직전 1위" 저장소가 없음 → 일일 cron(runRankingLeaders)이 metric별
 * 1위를 비교해 바뀌면 world_events(rank_leader) 기록 후 갱신. (server_id, metric) 1행.
 */
export const rankingLeaders = pgTable(
  'ranking_leaders',
  {
    serverId: smallint('server_id').notNull(),
    metric: text('metric').notNull(),
    userId: uuid('user_id').notNull(),
    /** 1위의 지표 값(0167) — 신기록 칭호의 "값 경신" 판정 근거. null=컬럼 도입 전 시드. */
    value: bigint('value', { mode: 'bigint' }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    /** 현재 1위가 된 시각(0185) — 유저 교체 시에만 리셋. 1위 칭호 위첨자 “N일”의 근거. */
    since: timestamp('since', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.serverId, t.metric] })],
);

/**
 * guild_rank_leaders(0185) — 길드 1위 추적(metric: rank=명가 level/xp · combat · zones · tax).
 * rank-leader 크론이 15분마다 현재 1위를 upsert, 길드 교체 시 since 리셋. 길드 1위 칭호 위첨자 “N일”의 근거.
 */
export const guildRankLeaders = pgTable(
  'guild_rank_leaders',
  {
    serverId: smallint('server_id').notNull(),
    metric: text('metric').notNull(),
    guildId: bigint('guild_id', { mode: 'bigint' }).notNull(),
    since: timestamp('since', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.serverId, t.metric] })],
);

/**
 * 개인 기록 마일스톤 워터마크(0103) — 스냅샷 cron이 값 교차를 감지해 월드·길드 로그를 남긴다.
 * 단조 증가(마지막으로 기록한 마일스톤 값) — 하락 후 재달성 재발화 없음.
 */
export const userMilestones = pgTable(
  'user_milestones',
  {
    userId: uuid('user_id').notNull(),
    serverId: smallint('server_id').notNull(),
    metric: text('metric').notNull(),
    milestone: bigint('milestone', { mode: 'bigint' }).notNull().default(sql`0`),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.serverId, t.metric] })],
);
