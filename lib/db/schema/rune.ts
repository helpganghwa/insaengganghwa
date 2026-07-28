import {
  bigserial,
  index,
  jsonb,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import type { AvatarAttr } from '@/lib/game/balance';

import { profiles } from './profiles';
import { userProfiles } from './avatar';

/**
 * 아바타 속성(0138·0141) — 아바타 생성 시 함께 각인되는 전투 속성 세트(유저 표기 = "속성").
 * 아바타 **종속**(2026-07-28 확정): 아바타 삭제 시 cascade로 함께 소멸. 외형(대표) 아바타와
 * 속성 적용 아바타는 별도 선택 가능(characters.active_profile_id / equipped_rune_id).
 * 속성 3줄(무/방/장)은 생성 시 서버 RNG로 확정·**불변**(§10 확률 공시 1:1). 줄 단위 조합 금지
 * (조합 허용 시 몰빵 조립이 가능해져 자연 희귀도·수집 경제 붕괴).
 * 적용 교체 쿨 24h + 다이아 단축(잔여분 1💎=1분).
 */
export const runes = pgTable(
  'runes',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    /** 소속 서버(SERVER.md P5) — 아바타(캐릭터 자산)에서 파생되므로 서버 종속. */
    serverId: smallint('server_id').notNull().default(1),
    /** 속성 3줄 [{slot,region,pct}] — balance §10 rollAvatarAttrs 산출값 그대로. */
    attrs: jsonb('attrs').$type<AvatarAttr[]>().notNull(),
    /** 이름(0139) — 생성 시 명명(지배 권역×등급대 톤). null=미명명(클라 폴백 표시). */
    name: text('name'),
    /** 출처 아바타(0141: 필수+cascade) — 지급 멱등키(unique). 아바타와 생사를 같이한다. */
    sourceProfileId: uuid('source_profile_id')
      .notNull()
      .references(() => userProfiles.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('runes_user_server_idx').on(t.userId, t.serverId),
    // 아바타 1개당 속성 1개(이중지급 방지·백필 멱등).
    uniqueIndex('runes_source_profile_uq').on(t.sourceProfileId),
  ],
);

export type Rune = typeof runes.$inferSelect;
