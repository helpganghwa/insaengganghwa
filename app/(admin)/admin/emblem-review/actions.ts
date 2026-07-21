'use server';

import { revalidatePath } from 'next/cache';
import { and, desc, eq, gte, isNull, lte } from 'drizzle-orm';

import { requireAdmin } from '@/lib/auth/require-admin';
import { safeBigInt } from '@/lib/util/id';
import { db } from '@/lib/db/client';
import { guilds, guildEmblems, guildEmblemEscrows } from '@/lib/db/schema/guild';
import { mailbox } from '@/lib/db/schema/mailbox';
import { walletAdd } from '@/lib/game/wallet';

/**
 * 길드 문양 검수 액션(0131) — 아바타 검수(profile-gen)와 동일한 결정 모델.
 *  - 검토 통과(confirm): 무조치 확인 기록(미검수 배지 해소).
 *  - 리젝+환불(reject): 소프트 삭제(removed_at — 이력 보존) + 활성이면 guilds 미러 해제
 *    + 연결된 유료 예치(completed) 자동 환불 + 길드장 통지 우편.
 *  - 별도 환불: 유료 예치 단독 환불(문양은 유지).
 */

export async function adminConfirmEmblem(emblemId: string): Promise<{ ok: boolean; msg?: string }> {
  await requireAdmin();
  const eid = safeBigInt(emblemId);
  if (eid === null) return { ok: false, msg: '잘못된 문양 ID입니다.' };
  const rows = await db
    .update(guildEmblems)
    .set({ adminDecision: 'confirm', adminReviewedAt: new Date() })
    .where(and(eq(guildEmblems.id, eid), isNull(guildEmblems.adminDecision)))
    .returning({ id: guildEmblems.id });
  if (rows.length === 0) return { ok: false, msg: '이미 검수된 문양입니다.' };
  revalidatePath('/admin/emblem-review');
  return { ok: true };
}

export async function adminRejectEmblem(emblemId: string): Promise<{ ok: boolean; msg?: string }> {
  await requireAdmin();
  const eid = safeBigInt(emblemId);
  if (eid === null) return { ok: false, msg: '잘못된 문양 ID입니다.' };
  const [emblem] = await db
    .select({ id: guildEmblems.id, guildId: guildEmblems.guildId, createdAt: guildEmblems.createdAt })
    .from(guildEmblems)
    .where(eq(guildEmblems.id, eid))
    .limit(1);
  if (!emblem) return { ok: false, msg: '문양을 찾을 수 없습니다.' };
  const [g] = await db
    .select({
      id: guilds.id,
      serverId: guilds.serverId,
      leaderUserId: guilds.leaderUserId,
      activeEmblemId: guilds.activeEmblemId,
    })
    .from(guilds)
    .where(eq(guilds.id, emblem.guildId))
    .limit(1);

  const refunded = await db.transaction(async (tx) => {
    // 조건부 소프트 삭제 먼저(1회 보장) — 동시 더블클릭 시 한쪽만 후속 처리.
    const claimed = await tx
      .update(guildEmblems)
      .set({ removedAt: new Date(), adminDecision: 'reject', adminReviewedAt: new Date() })
      .where(and(eq(guildEmblems.id, eid), isNull(guildEmblems.removedAt)))
      .returning({ id: guildEmblems.id });
    if (claimed.length === 0) return null;

    // 활성 문양이었다면 비정규화 미러 해제 — 지도·리스트 표시 즉시 무문양.
    if (g && g.activeEmblemId != null && g.activeEmblemId === eid) {
      await tx
        .update(guilds)
        .set({ activeEmblemId: null, emblemUrl: null, emblemColor: null })
        .where(eq(guilds.id, g.id));
    }

    // 연결된 유료 예치 자동 환불 — 같은 길드, 문양 생성 직전 1시간 내 completed 최신 1건.
    // (에스크로는 생성 요청 시, 문양 행은 생성 완료 시 기록 — 수 분 간격. FK가 없어 시간 매칭.)
    let amount: bigint | null = null;
    const [esc] = await tx
      .select({
        id: guildEmblemEscrows.id,
        userId: guildEmblemEscrows.userId,
        serverId: guildEmblemEscrows.serverId,
        amount: guildEmblemEscrows.amount,
      })
      .from(guildEmblemEscrows)
      .where(
        and(
          eq(guildEmblemEscrows.guildId, emblem.guildId),
          eq(guildEmblemEscrows.status, 'completed'),
          gte(guildEmblemEscrows.createdAt, new Date(emblem.createdAt.getTime() - 3_600_000)),
          lte(guildEmblemEscrows.createdAt, new Date(emblem.createdAt.getTime() + 600_000)),
        ),
      )
      .orderBy(desc(guildEmblemEscrows.createdAt))
      .limit(1);
    if (esc) {
      const moved = await tx
        .update(guildEmblemEscrows)
        .set({ status: 'refunded', resolvedAt: new Date() })
        .where(and(eq(guildEmblemEscrows.id, esc.id), eq(guildEmblemEscrows.status, 'completed')))
        .returning({ id: guildEmblemEscrows.id });
      if (moved.length > 0) {
        await walletAdd(tx, esc.userId, esc.serverId, esc.amount);
        amount = esc.amount;
        await tx.insert(mailbox).values({
          userId: esc.userId,
          serverId: esc.serverId,
          type: 'admin',
          title: '문양 생성 다이아 환불',
          body:
            `문의 주신 길드 문양 건에 대해 ${Number(esc.amount).toLocaleString('ko-KR')}💎를 환불해 드렸습니다.\n` +
            '이용에 불편을 드려 죄송합니다. 즐거운 강화 되세요!',
          senderLabel: '운영자',
          payload: {},
        });
      }
    }

    if (g?.leaderUserId) {
      await tx.insert(mailbox).values({
        userId: g.leaderUserId,
        serverId: g.serverId,
        type: 'admin',
        title: '길드 문양 안내',
        body:
          '운영 확인에 따라 길드 문양 1개가 제거되었습니다.' +
          (amount != null ? `\n생성에 사용된 ${Number(amount).toLocaleString('ko-KR')}💎는 결제하신 분께 환불되었습니다.` : '') +
          '\n문양 관리에서 보관 중인 다른 문양을 활성화하거나 새로 생성해 주세요.\n' +
          '궁금한 점은 고객센터로 문의해 주세요.',
        senderLabel: '운영자',
        payload: {},
      });
    }
    return amount;
  });
  if (refunded === null && !(await stillRemoved(eid))) return { ok: false, msg: '이미 처리된 문양입니다.' };
  revalidatePath('/admin/emblem-review');
  return { ok: true };
}

async function stillRemoved(eid: bigint): Promise<boolean> {
  const [r] = await db
    .select({ removedAt: guildEmblems.removedAt })
    .from(guildEmblems)
    .where(eq(guildEmblems.id, eid))
    .limit(1);
  return r?.removedAt != null;
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
