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
  bigserial,
  integer,
  uniqueIndex,
  jsonb,
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
    /** 다음 거주 이동 가능 시각(0139) — null/과거면 즉시 이동 가능. 보석 단축이 이 값을 앞당긴다. */
    residenceReadyAt: timestamp('residence_ready_at', { withTimezone: true }),
    // ── 칭호 이력 컬럼(0166, 2026-08-21) — PENDING 해소용 경량 이력 ──
    /** 현 거주 시작 시각(지박령) — 이사·최초 배정 시 갱신. */
    residenceSince: timestamp('residence_since', { withTimezone: true }),
    /** 거주 이동 누적(역마살) — 최초 배정 제외, 이사만 +1. */
    residenceMoveCount: integer('residence_move_count').notNull().default(0),
    /** 거쳐간 지역(방랑 대장장이) — region 문자열 배열(중복 없음). */
    visitedRegions: jsonb('visited_regions').notNull().default(sql`'[]'::jsonb`),
    /** 현 대표 아바타 유지 시작(한결같은 얼굴·단벌 신사) — 대표가 실제로 바뀔 때만 갱신. */
    activeProfileSince: timestamp('active_profile_since', { withTimezone: true }),
    /** 길드 기부 누적 횟수(아낌없는 손·대들보) — 계정 귀속(탈퇴해도 보존은 캐릭터 수명). */
    guildDonationCount: integer('guild_donation_count').notNull().default(0),
    /** 집행관 역임 구역 id 목록(tour_lord) — 임명 시 중복 없이 누적. */
    executorZoneHistory: jsonb('executor_zone_history').notNull().default(sql`'[]'::jsonb`),
    /** 칭호 즐겨찾기(0169) — code 문자열 배열(중복 없음·상한 10, 토글 액션이 강제). */
    favoriteTitles: jsonb('favorite_titles').notNull().default(sql`'[]'::jsonb`),
    /** 마지막 활동(캐릭터별) — 친구 표시·길드장 7일 자동위임 판정. */
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
    /** 활성 아바타(user_profiles.id, P6 이관) — null=기본 아이콘 폴백. FK는 0061 ALTER. */
    activeProfileId: uuid('active_profile_id'),
    /** 대표 칭호(서버별, 2026-08-07 칭호 서버별화 — 0152). null=미장착. */
    representativeTitleCode: text('representative_title_code'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.serverId] }),
    index('characters_server_idx').on(t.serverId),
    uniqueIndex('characters_nickname_uq').on(t.nickname),
    index('characters_residence_idx').on(t.residenceZoneId),
    // 친구 검색 nickname ILIKE '%term%' 부분일치용 trigram GIN(감사 F3-mail, manual 0088).
    // UNIQUE btree는 양끝 와일드카드엔 무용 → seq scan이던 것을 인덱스 스캔으로.
    index('characters_nickname_trgm_gin').using('gin', sql`${t.nickname} gin_trgm_ops`),
  ],
);

/**
 * 다이아 증감 원장(manual 0159) — characters.diamond가 어디서 들어오고 나갔는지 사후 추적.
 * 사고(익스플로잇·오지급) 시 부당 취득분 산정과 분쟁 대응("언제 무엇으로 얼마")의 근거.
 * 기록은 lib/game/wallet.ts 헬퍼 내부에서만 — 지갑 변경과 같은 트랜잭션이라 롤백 시 함께 사라진다.
 * 보존 180일(mail-expire 크론이 정리) — 장기 집계는 별도 일별 스냅샷 몫.
 */
export const diamondLedger = pgTable(
  'diamond_ledger',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    serverId: smallint('server_id').notNull(),
    /** 양수=유입, 음수=소모. 지갑에 **실제 반영된** 값만(차감 실패·0은 기록하지 않는다). */
    delta: bigint('delta', { mode: 'bigint' }).notNull(),
    /** 사유 코드 — lib/game/ledger.ts의 LedgerReason과 1:1. */
    reason: text('reason').notNull(),
    /** 추적 키(주문번호·우편 id·레이드 id 등) — 사고 시 원인 행위를 되짚는 실마리. */
    ref: text('ref'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('diamond_ledger_user_idx').on(t.userId, t.id.desc()),
    index('diamond_ledger_reason_idx').on(t.reason, t.createdAt.desc()),
    index('diamond_ledger_created_idx').on(t.createdAt),
  ],
);
