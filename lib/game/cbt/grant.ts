import 'server-only';

import { and, eq, isNull, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { cbtCarryover } from '@/lib/db/schema/cbt';
import { userProfiles } from '@/lib/db/schema/avatar';
import { mailbox } from '@/lib/db/schema/mailbox';

/**
 * CBT 참여 보상 lazy 지급 — (game) layout에서 after()로 호출(일일 보급과 동일 패턴).
 *
 * cbt_carryover에 미지급(granted_at null) 행이 있으면 1회 지급:
 *  1. 초대 이월 보상 — "CBT 감사 보상" 우편(💎·📦 첨부, 수령형).
 *  2. 기념 아바타 — CBT 마지막 착용 아바타를 user_profiles로 복원(비공개 깜짝) + 안내 우편.
 * 조건부 update(granted_at null → now)가 선행돼 동시 요청에도 정확히 1회만 지급(멱등).
 * CBT 기간엔 테이블이 비어 있어 no-op(스냅샷은 컷오버 직전 실행).
 */
export async function ensureCbtCarryover(userId: string, serverId: number): Promise<boolean> {
  // 빠른 경로 — 미지급 행 없으면 종료(부분 인덱스 스캔, 대부분의 요청).
  const [row] = await db
    .select()
    .from(cbtCarryover)
    .where(and(eq(cbtCarryover.userId, userId), isNull(cbtCarryover.grantedAt)))
    .limit(1);
  if (!row) return false;

  return db.transaction(async (tx) => {
    // 클레임 먼저(멱등, money path) — 0행이면 다른 요청이 지급 중/완료.
    const claimed = await tx
      .update(cbtCarryover)
      .set({ grantedAt: sql`now()` })
      .where(and(eq(cbtCarryover.userId, userId), isNull(cbtCarryover.grantedAt)))
      .returning({ userId: cbtCarryover.userId });
    if (claimed.length === 0) return false;

    // 1. 초대 이월 보상 우편(수령형 첨부) — 3슬롯 균등 분배.
    if (row.inviteCount > 0 && (row.inviteDiamond > 0 || row.inviteBoxes > 0)) {
      const perSlot = Math.floor(row.inviteBoxes / 3);
      await tx.insert(mailbox).values({
        userId,
        serverId,
        type: 'reward',
        title: 'CBT 감사 보상 — 친구 초대',
        body:
          `CBT를 함께해 주셔서 감사합니다!\n` +
          `CBT 기간에 초대한 ${row.inviteCount}명의 보상을 그대로 다시 담아 드렸어요.\n` +
          `실운영에서도 초대 보상은 새로 적립됩니다.`,
        senderLabel: '시스템',
        payload: {
          diamond: row.inviteDiamond,
          boxes: { weapon: perSlot, armor: perSlot, accessory: perSlot },
        },
      });
    }

    // 2. 기념 아바타 복원 — 스냅샷 원본 행 기반, 이미지는 wipe-안전 복사본(south만).
    const ks = row.keepsake as {
      pixellab_character_id?: string;
      options?: Record<string, unknown>;
      equipment_snapshot?: unknown;
      description_prompt?: string;
    } | null;
    if (ks && row.keepsakeImageUrl) {
      await tx.insert(userProfiles).values({
        userId,
        serverId,
        rotations: { south: row.keepsakeImageUrl },
        activeDirection: 'south',
        pixellabCharacterId: ks.pixellab_character_id ?? 'cbt-keepsake',
        options: { ...(ks.options ?? {}), cbtKeepsake: true },
        equipmentSnapshot: ks.equipment_snapshot ?? {},
        descriptionPrompt: ks.description_prompt ?? 'CBT keepsake avatar',
      });
      await tx.insert(mailbox).values({
        userId,
        serverId,
        type: 'admin',
        title: 'CBT 기념 선물이 도착했어요',
        body:
          `${row.nickname ? row.nickname + '님, ' : ''}CBT에서 마지막으로 함께했던 아바타를 돌려드립니다.\n` +
          `내 정보 → 아바타 목록에서 확인하세요. 다시 만나서 반가워요!`,
        senderLabel: '시스템',
        payload: {},
      });
    }

    return true;
  });
}
