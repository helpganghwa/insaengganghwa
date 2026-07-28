import {
  bigserial,
  index,
  jsonb,
  pgTable,
  smallint,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import type { AvatarAttr } from '@/lib/game/balance';

import { profiles } from './profiles';

/**
 * 룬(0138) — 아바타 생성 시 지급되는 PvP 속성 세트. 아바타와 **독립 관리**(아바타 삭제 무관).
 * 속성 3줄(무/방/장)은 생성 시 서버 RNG로 확정·**불변**(§10 확률 공시 1:1). 줄 단위 조합 금지
 * (조합 허용 시 몰빵 조립이 가능해져 자연 희귀도·수집 경제 붕괴 — 2026-07-28 확정).
 * 장착은 characters.equipped_rune_id(1개), 교체 쿨 72h + 다이아 단축(잔여분 1💎=1분).
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
    /** 출처 아바타(user_profiles.id) — 지급 멱등키(unique) 겸 참고. 아바타 삭제와 무관(FK 없음). */
    sourceProfileId: uuid('source_profile_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('runes_user_server_idx').on(t.userId, t.serverId),
    // 아바타 1개당 룬 1개(이중지급 방지·백필 멱등). null(비아바타 출처)은 다중 허용.
    uniqueIndex('runes_source_profile_uq').on(t.sourceProfileId),
  ],
);

export type Rune = typeof runes.$inferSelect;
