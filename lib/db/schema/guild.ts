/**
 * GUILD.md §1~§5.6. 길드 — 협력 성장 + 월드맵 점령전.
 *
 * 마지막 콘텐츠(출시·DAU 이후 투입). 점령은 결정론·비동기(KST 23:00 정산, 별도 팀전 엔진).
 * 수용 = min(50, 10+level)·레벨 무제한(L41+ 과시). 50명=50구역=이론상 천하통일(집행관제로 자연 견제).
 * 세금: 거주 구역 강화 성공 → 구역 포인트 누적 → 집행관 수집(쿨다운 3일=72h) → 길드 풀 → 100:1💎 분배(균등/특정).
 * 수치(레벨 XP·수비 ±·환산율)는 BALANCE/시뮬 튜닝 — 본 스키마는 구조만.
 *
 * ⚠ 본 스키마의 실제 테이블 생성은 **별도 수동 마이그레이션**(아직 미작성/미적용) — 적용 전엔 inert.
 *   순환 import 회피: profiles.residence_zone_id → zones FK는 마이그레이션 ALTER로 추가.
 */
import {
  pgTable,
  smallint,
  pgEnum,
  uuid,
  text,
  bigint,
  bigserial,
  integer,
  real,
  date,
  jsonb,
  timestamp,
  index,
  uniqueIndex,
  primaryKey,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

import { profiles } from './profiles';

export const guildRoleEnum = pgEnum('guild_role', ['leader', 'vice', 'member']);
export const zoneRegionEnum = pgEnum('zone_region', [
  'volcano',
  'temple',
  'swamp',
  'orc',
  'kingdom', // 중앙 인간 왕국(6)
  'angel', // 분리된 타락 천사 부유섬(4)
]); // 'sky'(구 중앙 천사섬)는 폐기 — DB enum엔 잔존하나 미사용
export const guildDeployRoleEnum = pgEnum('guild_deploy_role', ['attack', 'defend']);

/** §1·§2 guilds. name 변경불가. level=수용(10+level, L40서 50상한)+무제한(L41+ 과시, 혜택0). */
export const guilds = pgTable('guilds', {
  id: bigserial('id', { mode: 'bigint' }).primaryKey(),
  /** 소속 서버(SERVER.md P5) — 길드명 유일성은 서버별(guilds_server_name_uq). */
  serverId: smallint('server_id').notNull().default(1),
  name: text('name').notNull().unique(),
  /** 3축(모양·색상톤·키워드) Pixellab 생성물(§1.6). 생성 전/실패 시 null → 폴백 문양. */
  emblemUrl: text('emblem_url'),
  /** 선택 색상톤 — UI 악센트(맵 구분은 문양 썸네일). */
  emblemColor: text('emblem_color'),
  /**
   * 활성 문양(`guild_emblems.id`) — 보관 문양(최대 5) 중 사용 중. null=미설정/생성 전.
   * emblem_url·emblem_color는 이 활성 문양의 **비정규화 미러**(모든 읽기 코드 호환 유지).
   * FK는 마이그레이션에서 ALTER 추가(guilds↔guild_emblems 상호참조 회피, residence와 동일 패턴).
   */
  activeEmblemId: bigint('active_emblem_id', { mode: 'bigint' }),
  /** 길드 공지 ≤200자(길드장/부길드장만 편집, 멤버 전용 노출). */
  notice: text('notice'),
  /** 길드 소개(공개) — 목록 팝업 노출용. 길드장/부길드장 편집. null=미설정. */
  intro: text('intro'),
  /** 카카오 오픈채팅 링크(길드장/부길드장만 편집) — 인게임 채팅 대신 외부 소통 채널. null=미설정. */
  openchatUrl: text('openchat_url'),
  /** 가입 방식 — 'open'(자유: 신청 즉시 가입) | 'approval'(승인: 길드장/부길드장 승인 필요). 기본=승인. */
  joinPolicy: text('join_policy').notNull().default('approval'),
  /** 0+. 무제한 — 수용은 min(50,10+level), L41+는 과시·랭킹용(버프·전투력 영향 0). */
  level: integer('level').notNull().default(0),
  xp: bigint('xp', { mode: 'bigint' }).notNull().default(sql`0`),
  /** 집행관 수금으로 누적된 미분배 세금 💎(집행관 90% 몫). */
  taxPoolDiamond: bigint('tax_pool_diamond', { mode: 'bigint' }).notNull().default(sql`0`),
  leaderUserId: uuid('leader_user_id')
    .notNull()
    .references(() => profiles.id),
  /**
   * 길드장 자동 위임 경고 발송 시각(§4) — 5일차 경고 우편 1회 멱등 키.
   * 위임 완료 또는 길드장 재활동(미접속<5일) 시 null로 리셋 → 다음 잠수 때 다시 경고.
   */
  leaderHandoverWarnedAt: timestamp('leader_handover_warned_at', { withTimezone: true }),
  /** 직전 전투력 랭킹(1~3, 그 외 null) — 랭킹 업적 중복 로깅 방지(변동 시만 피드 기록). */
  lastPowerRank: smallint('last_power_rank'),
  /** 직전 점령지 랭킹(1~3, 그 외 null). */
  lastZoneRank: smallint('last_zone_rank'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/** §1 guild_members — user_id PK = 1유저 1길드. 기여도=기부(점령전 제외, §3). */
export const guildMembers = pgTable(
  'guild_members',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    /** 소속 서버(SERVER.md P5) — 1유저 1길드는 서버별. */
    serverId: smallint('server_id').notNull().default(1),
    guildId: bigint('guild_id', { mode: 'bigint' })
      .notNull()
      .references(() => guilds.id, { onDelete: 'cascade' }),
    role: guildRoleEnum('role').notNull().default('member'),
    contributionPoints: bigint('contribution_points', { mode: 'bigint' }).notNull().default(sql`0`),
    /** 일 3회 기부 카운터(KST 자정 리셋). */
    dailyDonationCount: integer('daily_donation_count').notNull().default(0),
    lastDonationKstDay: date('last_donation_kst_day'),
    joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.serverId] }), index('guild_member_guild_idx').on(t.guildId)],
);

/** §1 가입 신청 — 승인제(approval) 길드 전용. user_id PK = 1유저 1신청. 승인/거절/가입 시 삭제. */
export const guildJoinRequests = pgTable(
  'guild_join_requests',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    /** 소속 서버(SERVER.md P5) — 1유저 1신청은 서버별. */
    serverId: smallint('server_id').notNull().default(1),
    guildId: bigint('guild_id', { mode: 'bigint' })
      .notNull()
      .references(() => guilds.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.serverId] }), index('guild_join_req_guild_idx').on(t.guildId)],
);

/** §1 탈퇴 로그 — 24h 재가입 제한(가장 최근 left_at 기준). append-only. */
export const guildLeaveLog = pgTable(
  'guild_leave_log',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    /** 소속 서버(SERVER.md P5) — 24h 재가입 제한은 서버별. */
    serverId: smallint('server_id').notNull().default(1),
    leftAt: timestamp('left_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('guild_leave_user_idx').on(t.userId, t.leftAt)],
);

/** §5.2·§5.6 zones — 총 50(시드 고정 id). 좌표만(인접은 zone_adjacency). owner/executor nullable=중립. */
export const zones = pgTable(
  'zones',
  {
    id: integer('id').primaryKey(),
    /** 소속 서버(SERVER.md P5) — 서버별 월드(신서버 = 새 50행 시드). */
    serverId: smallint('server_id').notNull().default(1),
    region: zoneRegionEnum('region').notNull(),
    name: text('name').notNull(),
    /** 오버레이 % 좌표(0~100, 해상도 독립). */
    mapX: real('map_x').notNull(),
    mapY: real('map_y').notNull(),
    /** null = 중립. 점령 시 set, 패배/해산 시 null. */
    ownerGuildId: bigint('owner_guild_id', { mode: 'bigint' }).references(() => guilds.id, {
      onDelete: 'set null',
    }),
    /** 집행관(상시) — 세금 수집권·자동 방어(×3). 소유 시 ≥1 필수. */
    executorUserId: uuid('executor_user_id').references(() => profiles.id, { onDelete: 'set null' }),
    /** 세금 포인트 누적기 — 강화 성공=도달레벨 가산, 100pt마다 tax_diamond +1로 환산(잔여 carry). */
    taxPoints: bigint('tax_points', { mode: 'bigint' }).notNull().default(sql`0`),
    /** 미수금 누적 세금 💎(포인트 100당 +1, 집행관 수금 대상, 점령 시 신 소유자로 이전). */
    taxDiamond: bigint('tax_diamond', { mode: 'bigint' }).notNull().default(sql`0`),
    /** 집행관 수금 72h(3일) 쿨다운 기준. */
    lastTaxCollectedAt: timestamp('last_tax_collected_at', { withTimezone: true }),
    capturedAt: timestamp('captured_at', { withTimezone: true }),
  },
  (t) => [index('zone_owner_idx').on(t.ownerGuildId)],
);

/** §5.6 zone_adjacency — 인접 공격 규칙에 사용(deploy.ts assertAttackable·배치 UI 필터). 무방향 간선 정규형 a<b. */
export const zoneAdjacency = pgTable(
  'zone_adjacency',
  {
    zoneA: integer('zone_a')
      .notNull()
      .references(() => zones.id, { onDelete: 'cascade' }),
    zoneB: integer('zone_b')
      .notNull()
      .references(() => zones.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.zoneA, t.zoneB] })],
);

/** §5.4 guild_battle_deployments — 1인 1배치/일(KST). 23:00 잠금. 집행관은 자동 방어(미기록). */
export const guildBattleDeployments = pgTable(
  'guild_battle_deployments',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    /** 소속 서버(SERVER.md P5). */
    serverId: smallint('server_id').notNull().default(1),
    battleKstDay: date('battle_kst_day').notNull(),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    guildId: bigint('guild_id', { mode: 'bigint' })
      .notNull()
      .references(() => guilds.id, { onDelete: 'cascade' }),
    zoneId: integer('zone_id')
      .notNull()
      .references(() => zones.id, { onDelete: 'cascade' }),
    role: guildDeployRoleEnum('role').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('deploy_user_day_uq').on(t.userId, t.serverId, t.battleKstDay),
    index('deploy_zone_day_idx').on(t.zoneId, t.battleKstDay),
  ],
);

/** §5.4 conquest_battles — 구역×일 1전투(결정론 팀전 엔진). finale=참가자·전투력·리플레이. */
export const conquestBattles = pgTable(
  'conquest_battles',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    /** 소속 서버(SERVER.md P5) — zone 파생값의 명시 컬럼(조회 효율). */
    serverId: smallint('server_id').notNull().default(1),
    battleKstDay: date('battle_kst_day').notNull(),
    zoneId: integer('zone_id')
      .notNull()
      .references(() => zones.id, { onDelete: 'cascade' }),
    /** null = 전투 없음(무공격). 소유권 변동 없을 수도. */
    winnerGuildId: bigint('winner_guild_id', { mode: 'bigint' }).references(() => guilds.id, {
      onDelete: 'set null',
    }),
    finale: jsonb('finale').$type<unknown>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    /**
     * 지연 공개(reveal) 시각 — GUILD §5.8. 23:00 정산은 결과만 저장(null)하고 소유권/우편 미적용,
     * 24:00 공개 때 소유권 적용·우편 발송 후 stamp. 전투 기록 조회는 not-null 행만 노출.
     */
    publishedAt: timestamp('published_at', { withTimezone: true }),
  },
  (t) => [uniqueIndex('conquest_zone_day_uq').on(t.zoneId, t.battleKstDay)],
);

/** §5.5 세금 분배 로그(공개) — 길드장 분배 시 1행(리더 독식 견제). */
export const guildTaxDistributions = pgTable(
  'guild_tax_distributions',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    guildId: bigint('guild_id', { mode: 'bigint' })
      .notNull()
      .references(() => guilds.id, { onDelete: 'cascade' }),
    byUserId: uuid('by_user_id')
      .notNull()
      .references(() => profiles.id),
    mode: text('mode').notNull(), // 'equal' | 'target' | 'manual'(distributeGuildTaxManual — 멤버별 수동 지정)
    total: bigint('total', { mode: 'bigint' }).notNull(), // 분배 총 💎
    targetUserId: uuid('target_user_id'), // target 모드 수령자
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('guild_tax_dist_idx').on(t.guildId, t.createdAt)],
);

/**
 * 0046/0047 세계 연대기(AI) — 큰 사건 있는 날만 1행(점령전 발표 KST 자정(00:00)).
 * today_text='오늘'(긴 사관 스토리), headline='전체' 리스트용 그날 핵심 사건 한 줄.
 * 본문은 종류별 마커로 강조 렌더: {g|길드}·{u|인물}·{r|지역}(지역색).
 */
export const worldChronicle = pgTable(
  'world_chronicle',
  {
    /** 소속 서버(SERVER.md P5) — 서버별 일일 연대기. */
    serverId: smallint('server_id').notNull().default(1),
    kstDay: date('kst_day').notNull(),
    todayText: text('today_text').notNull(),
    headline: text('headline').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.serverId, t.kstDay] })],
);

/**
 * 0049 길드 문양 보관함 — 길드당 최대 3개(앱 로직 제한, 최소 1). 아바타 다중 프로필 패턴 미러.
 * 활성 문양은 guilds.active_emblem_id가 가리키고, guilds.emblem_url/color에 비정규화 미러.
 */
export const guildEmblems = pgTable(
  'guild_emblems',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    guildId: bigint('guild_id', { mode: 'bigint' })
      .notNull()
      .references(() => guilds.id, { onDelete: 'cascade' }),
    /** Pixellab 생성물 public URL(+캐시버스트). 생성 직후 채워짐. */
    emblemUrl: text('emblem_url'),
    /** 선택 색상톤(emblem 3축 중 tone). */
    emblemColor: text('emblem_color'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('guild_emblem_guild_idx').on(t.guildId)],
);

/**
 * 길드 감사 로그(§4 운영) — 임원/시스템의 민감 액션 기록(추방·위임·부길드장·해산·가입정책·자동위임).
 * 분쟁·어뷰징 추적용 **기록 전용**(v1 조회 UI 없음). 역사 보존을 위해 guild/user FK 없음(비정규화) —
 * 길드 해산·계정 삭제 후에도 로그 잔존. actor null = 시스템(자동 위임).
 */
export const guildAuditLog = pgTable(
  'guild_audit_log',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    serverId: smallint('server_id').notNull().default(1),
    guildId: bigint('guild_id', { mode: 'bigint' }).notNull(),
    /** 행위자(임원). 시스템 액션(auto_handover)은 null. FK 없음(역사 보존). */
    actorUserId: uuid('actor_user_id'),
    /** kick|transfer_leadership|set_vice|unset_vice|disband|set_join_policy|auto_handover */
    action: text('action').notNull(),
    /** 대상 유저(추방·위임 대상 등). 없으면 null. */
    targetUserId: uuid('target_user_id'),
    /** 부가 맥락(예: { policy }, { from }). */
    detail: jsonb('detail'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('guild_audit_idx').on(t.guildId, t.createdAt)],
);

export type Guild = typeof guilds.$inferSelect;
export type GuildEmblem = typeof guildEmblems.$inferSelect;
export type GuildMember = typeof guildMembers.$inferSelect;
export type Zone = typeof zones.$inferSelect;
export type GuildBattleDeployment = typeof guildBattleDeployments.$inferSelect;
export type ConquestBattle = typeof conquestBattles.$inferSelect;
export type WorldChronicle = typeof worldChronicle.$inferSelect;
export type GuildAuditLog = typeof guildAuditLog.$inferSelect;
