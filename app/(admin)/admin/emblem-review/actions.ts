'use server';

import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';

import { requireAdmin } from '@/lib/auth/require-admin';
import { safeBigInt } from '@/lib/util/id';
import { db } from '@/lib/db/client';
import { guilds, guildEmblems, guildEmblemEscrows } from '@/lib/db/schema/guild';
import { mailbox } from '@/lib/db/schema/mailbox';
import { walletAdd } from '@/lib/game/wallet';

/**
 * 길드 문양 검수 액션(2026-07-21) — 아바타 검수(profile-gen)와 동일한 분쟁 대응 축.
 *  - 제거: 부적절 문양 삭제(활성이면 guilds 미러 해제) + 길드장 통지 우편
 *  - 환불: 유료 재생성 예치(completed)를 refunded로 전이 + 다이아 반환 + 우편
 */

export async function adminRemoveEmblem(emblemId: string): Promise<{ ok: boolean; msg?: string }> {
  await requireAdmin();
  const eid = safeBigInt(emblemId);
  if (eid === null) return { ok: false, msg: '잘못된 문양 ID입니다.' };
  const [row] = await db
    .select({ id: guildEmblems.id, guildId: guildEmblems.guildId })
    .from(guildEmblems)
    .where(eq(guildEmblems.id, eid))
    .limit(1);
  if (!row) return { ok: false, msg: '문양을 찾을 수 없습니다(이미 삭제됨).' };
  const [g] = await db
    .select({
      id: guilds.id,
      serverId: guilds.serverId,
      leaderUserId: guilds.leaderUserId,
      activeEmblemId: guilds.activeEmblemId,
    })
    .from(guilds)
    .where(eq(guilds.id, row.guildId))
    .limit(1);

  await db.transaction(async (tx) => {
    // 삭제 먼저(조건부) — 동시 더블클릭 시 한쪽만 후속 처리.
    const del = await tx.delete(guildEmblems).where(eq(guildEmblems.id, eid)).returning({ id: guildEmblems.id });
    if (del.length === 0) return;
    // 활성 문양이었다면 비정규화 미러 해제 — 지도·리스트 등 모든 표시가 즉시 무문양으로.
    if (g && g.activeEmblemId != null && g.activeEmblemId === eid) {
      await tx
        .update(guilds)
        .set({ activeEmblemId: null, emblemUrl: null, emblemColor: null })
        .where(eq(guilds.id, g.id));
    }
    if (g?.leaderUserId) {
      await tx.insert(mailbox).values({
        userId: g.leaderUserId,
        serverId: g.serverId,
        type: 'admin',
        title: '길드 문양 안내',
        body:
          '운영 확인에 따라 길드 문양 1개가 제거되었습니다.\n' +
          '문양 관리에서 보관 중인 다른 문양을 활성화하거나 새로 생성해 주세요.\n' +
          '궁금한 점은 고객센터로 문의해 주세요.',
        senderLabel: '운영자',
        payload: {},
      });
    }
  });
  revalidatePath('/admin/emblem-review');
  return { ok: true };
}

export async function adminRefundEmblemEscrow(escrowId: string): Promise<{ ok: boolean; msg?: string }> {
  await requireAdmin();
  const eid = safeBigInt(escrowId);
  if (eid === null) return { ok: false, msg: '잘못된 예치 ID입니다.' };
  const ok = await db.transaction(async (tx) => {
    // 조건부 전이(money path) — completed일 때만 refunded로, 정확히 1회.
    const rows = await tx
      .update(guildEmblemEscrows)
      .set({ status: 'refunded', resolvedAt: new Date() })
      .where(and(eq(guildEmblemEscrows.id, eid), eq(guildEmblemEscrows.status, 'completed')))
      .returning({
        userId: guildEmblemEscrows.userId,
        serverId: guildEmblemEscrows.serverId,
        amount: guildEmblemEscrows.amount,
      });
    const r = rows[0];
    if (!r) return false;
    await walletAdd(tx, r.userId, r.serverId, r.amount);
    await tx.insert(mailbox).values({
      userId: r.userId,
      serverId: r.serverId,
      type: 'admin',
      title: '문양 생성 다이아 환불',
      body:
        `문의 주신 길드 문양 생성 건에 대해 ${Number(r.amount).toLocaleString('ko-KR')}💎를 환불해 드렸습니다.\n` +
        '이용에 불편을 드려 죄송합니다. 즐거운 강화 되세요!',
      senderLabel: '운영자',
      payload: {},
    });
    return true;
  });
  if (!ok) return { ok: false, msg: '환불 가능한 상태가 아닙니다(이미 환불됐거나 미완료 예치).' };
  revalidatePath('/admin/emblem-review');
  return { ok: true };
}
