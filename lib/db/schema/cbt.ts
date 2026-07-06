import { sql } from 'drizzle-orm';
import { pgTable, uuid, integer, jsonb, text, timestamp, index } from 'drizzle-orm/pg-core';

import { profiles } from './profiles';

/**
 * CBT 참여 보상 이월 — 실운영 컷오버(wipe) 전에 스냅샷 스크립트(scripts/cbt-snapshot.ts)가
 * 채우고, wipe 직후 복원 스크립트(scripts/cbt-restore.ts)가 1서버에 캐릭터를 사전 생성하며
 * 지급(granted_at 마킹). lazy 지급(lib/game/cbt/grant.ts)은 사전 복원이 누락한 행의 백스톱.
 *
 * 이월 범위(정책): **닉네임 + 아바타 전 목록(비기본) + 추천 보상**. 진행도(강화/다이아/장비)는
 * 이월하지 않는다 — 리셋 오픈이 전제.
 *
 * ⚠ 실운영 컷오버(wipe) 스크립트에서 이 테이블은 **삭제 대상에서 제외**해야 한다 —
 *   wipe를 건너 살아남는 것이 존재 이유. auth/profiles는 계정 유지 방침이라 user_id가
 *   CBT→실운영에 동일하게 유지된다.
 */
export const cbtCarryover = pgTable(
  'cbt_carryover',
  {
    userId: uuid('user_id')
      .primaryKey()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    /** CBT 닉네임 — 복원 시 그대로 캐릭터 닉으로 사용(전역 유일, wipe 후라 충돌 없음). */
    nickname: text('nickname'),
    /** CBT 기간 성공 초대 수(referral_attributions rewarded 집계). */
    inviteCount: integer('invite_count').notNull().default(0),
    /** 이월 지급할 💎 총량(= count × 당시 단가, 스냅샷 시점 확정). */
    inviteDiamond: integer('invite_diamond').notNull().default(0),
    /** 이월 지급할 📦 총량(3슬롯 균등 분배 가능해야 함). */
    inviteBoxes: integer('invite_boxes').notNull().default(0),
    /**
     * 이월 아바타 목록(비기본 전부) — 각 원소:
     * `{ image_url, was_active, pixellab_character_id, options, equipment_snapshot,
     *    description_prompt, created_at }`.
     * image_url = 정면(south) PNG의 wipe-생존 복사본(storage cbt-keepsake/). 아바타는
     * 정면 1방향만 사용(기획 확정) — 복원 rotations는 `{ south }`만 채운다. null=지급 없음.
     */
    avatars: jsonb('avatars'),
    snapshotAt: timestamp('snapshot_at', { withTimezone: true }).notNull().defaultNow(),
    /** 지급 완료 시각 — null이면 미지급. 조건부 update로 멱등 보장. */
    grantedAt: timestamp('granted_at', { withTimezone: true }),
  },
  (t) => [
    // 실운영 lazy 지급 조회용 — 미지급 행만 스캔.
    index('cbt_carryover_ungranted_idx').on(t.userId).where(sql`${t.grantedAt} IS NULL`),
  ],
);
