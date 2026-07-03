import { sql } from 'drizzle-orm';
import { pgTable, uuid, integer, jsonb, text, timestamp, index } from 'drizzle-orm/pg-core';

import { profiles } from './profiles';

/**
 * CBT 참여 보상 이월 — 실운영 전환(wipe) 전에 스냅샷 스크립트(scripts/cbt-snapshot.ts)가
 * 채우고, 실운영에서 lazy 지급(lib/game/cbt/grant.ts) 후 granted_at 마킹.
 *
 * ⚠ 실운영 컷오버(wipe) 스크립트에서 이 테이블은 **삭제 대상에서 제외**해야 한다 —
 *   wipe를 건너 살아남는 것이 존재 이유. auth/profiles는 계정 유지 방침이라 user_id가
 *   CBT→실운영에 동일하게 유지된다(cutover-v3 "계정 유지: 예" 패턴).
 */
export const cbtCarryover = pgTable(
  'cbt_carryover',
  {
    userId: uuid('user_id')
      .primaryKey()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    /** CBT 당시 닉네임(우편 문구용 — 실운영 닉네임과 다를 수 있음). */
    nickname: text('nickname'),
    /** CBT 기간 성공 초대 수(referral_attributions rewarded 집계). */
    inviteCount: integer('invite_count').notNull().default(0),
    /** 이월 지급할 💎 총량(= count × 당시 단가, 스냅샷 시점 확정). */
    inviteDiamond: integer('invite_diamond').notNull().default(0),
    /** 이월 지급할 📦 총량(3슬롯 균등 분배 가능해야 함). */
    inviteBoxes: integer('invite_boxes').notNull().default(0),
    /**
     * 기념 아바타 — CBT 마지막 착용(기본 제외, 없으면 최근 생성) user_profiles 행 원본 스냅샷.
     * rotations/options/equipmentSnapshot/descriptionPrompt/pixellabCharacterId 포함. null=지급 없음.
     */
    keepsake: jsonb('keepsake'),
    /** 기념 아바타 south.png의 wipe-안전 복사본 storage 공개 URL(cbt-keepsake/). */
    keepsakeImageUrl: text('keepsake_image_url'),
    snapshotAt: timestamp('snapshot_at', { withTimezone: true }).notNull().defaultNow(),
    /** 지급 완료 시각 — null이면 미지급. 조건부 update로 멱등 보장. */
    grantedAt: timestamp('granted_at', { withTimezone: true }),
  },
  (t) => [
    // 실운영 lazy 지급 조회용 — 미지급 행만 스캔.
    index('cbt_carryover_ungranted_idx').on(t.userId).where(sql`${t.grantedAt} IS NULL`),
  ],
);
