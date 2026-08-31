'use server';

import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';

import { requireAdmin } from '@/lib/auth/require-admin';
import { db } from '@/lib/db/client';
import { avatarReturnRequests } from '@/lib/db/schema/avatar';
import { mailbox } from '@/lib/db/schema/mailbox';

type Result = { status: 'success' } | { status: 'error'; code: string };

/**
 * 아바타 반환 판정(0183) — 아바타는 신청 시 이미 회수됨. 여기서는 지급액만 결정한다.
 * full = 실지불 전액(생성 결과 하자 등 요건 충족) / half = 절반(단순 변심 등).
 * 지급은 우편(reward, 명시 수령) — 지갑 직가산 대신 기존 보상 문법 유지.
 */
export async function decideAvatarReturn(
  requestId: string,
  outcome: 'full' | 'half',
  note?: string,
): Promise<Result> {
  await requireAdmin();
  const id = BigInt(requestId);
  return db.transaction(async (tx) => {
    const [req] = await tx
      .select()
      .from(avatarReturnRequests)
      .where(and(eq(avatarReturnRequests.id, id), eq(avatarReturnRequests.status, 'pending')))
      .for('update')
      .limit(1);
    if (!req) return { status: 'error', code: 'NOT_FOUND_OR_DECIDED' };

    const paid = Number(req.paidDiamond);
    const refund = outcome === 'full' ? paid : Math.floor(paid / 2);
    await tx.insert(mailbox).values({
      userId: req.userId,
      serverId: req.serverId,
      type: 'reward',
      title: '아바타 반환 지급',
      body:
        outcome === 'full'
          ? `반환하신 아바타를 확인했습니다. 생성에 사용한 다이아 전액(💎${paid.toLocaleString('ko-KR')})을 돌려드립니다.`
          : `반환하신 아바타를 확인했습니다. 안내드린 기준에 따라 생성 비용의 절반(💎${refund.toLocaleString('ko-KR')})을 지급해 드립니다.`,
      senderLabel: '운영자',
      payload: { diamond: refund, boxes: { weapon: 0, armor: 0, accessory: 0 } },
    });
    await tx
      .update(avatarReturnRequests)
      .set({
        status: outcome === 'full' ? 'paid_full' : 'paid_half',
        refundDiamond: BigInt(refund),
        adminNote: note?.slice(0, 500) ?? null,
        decidedAt: new Date(),
      })
      .where(eq(avatarReturnRequests.id, id));

    revalidatePath('/admin/avatar-returns');
    return { status: 'success' };
  });
}
