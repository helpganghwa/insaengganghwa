import 'server-only';

import { and, eq, isNull, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { getMaintenanceState } from '@/lib/game/system-mode';
import { cbtCarryover } from '@/lib/db/schema/cbt';
import { characters } from '@/lib/db/schema/server';
import { mailbox } from '@/lib/db/schema/mailbox';


/**
 * CBT 이월 lazy 지급 **백스톱** — (game) layout에서 after()로 호출(일일 보급과 동일 패턴).
 *
 * 정상 경로는 컷오버 데이의 사전 복원(scripts/cbt-restore.ts — 캐릭터 사전 생성 + 지급 +
 * granted_at 마킹)이라 대부분의 유저에게 이 함수는 빠른 no-op다. 사전 복원이 건너뛴 행
 * (닉네임 유실 등)만 여기서 지급된다:
 *  1. 초대 이월 보상 — "CBT 감사 보상" 우편(💎·📦 첨부, 수령형).
 *  2. 감사 보상 우편(합산강화 비례 💎, 0144).
 * 조건부 update(granted_at null → now)가 선행돼 동시 요청에도 정확히 1회만 지급(멱등).
 */
export async function ensureCbtCarryover(userId: string, serverId: number): Promise<boolean> {
  // CBT 종료~출시 사이(cbt_ended)엔 지급하지 않는다(2026-07-31 2단계 플로우) — 이 기간에
  // 접속하는 건 어드민·심사 계정뿐인데, 여기서 지급하면 granted_at이 소진돼 출시 직전
  // 2차 wipe 후 재복원(cbt-restore)에서 스킵되고, 받은 우편은 wipe로 사라져 보상이 증발한다.
  const maint = await getMaintenanceState().catch(() => null);
  if (maint?.active && maint.mode === 'cbt_ended') return false;

  // 빠른 경로 — 미지급 행 없으면 종료(부분 인덱스 스캔, 대부분의 요청).
  const [row] = await db
    .select()
    .from(cbtCarryover)
    .where(and(eq(cbtCarryover.userId, userId), isNull(cbtCarryover.grantedAt)))
    .limit(1);
  if (!row) return false;

  // 활성 서버에 캐릭터가 없으면 지급 보류(1회권 소진 방지) — user_profiles는 characters
  // FK가 없어 캐릭터 없는 서버에도 insert가 성공해버린다. 캐릭터가 생긴 뒤 재방문 시 지급.
  const [ch] = await db
    .select({ uid: characters.userId })
    .from(characters)
    .where(and(eq(characters.userId, userId), eq(characters.serverId, serverId)))
    .limit(1);
  if (!ch) return false;

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
          `정식 서비스에서도 초대 보상은 새로 적립됩니다.`,
        senderLabel: '인생강화',
        payload: {
          diamond: row.inviteDiamond,
          boxes: { weapon: perSlot, armor: perSlot, accessory: perSlot },
        },
      });
    }

    // 2. 감사 보상(0144) — 합산강화 비례 다이아(전원). 스냅샷 시점 확정값을 그대로 지급.
    if (row.thanksDiamond > 0) {
      await tx.insert(mailbox).values({
        userId,
        serverId,
        type: 'reward',
        title: 'CBT 참여 특별 보상',
        body:
          `비공개 테스트를 함께해 주셔서 감사합니다.\n` +
          // 산정 수치(합산강화)는 본문에 노출하지 않는다(2026-08-21) — 산정 방식 문의 유발.
          `CBT에서 쌓아 올리신 기록을 담아 감사 다이아를 보내드립니다.`,
        senderLabel: '인생강화',
        payload: { diamond: row.thanksDiamond },
      });
    }

    return true;
  });
}
