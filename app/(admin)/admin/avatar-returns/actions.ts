'use server';

import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';

import { requireAdmin } from '@/lib/auth/require-admin';
import { db } from '@/lib/db/client';
import { avatarReturnRequests, profileGenerationJobs } from '@/lib/db/schema/avatar';
import { characterIdFromSpriteUrl } from '@/lib/game/profile/return';
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

    // 이중 지급 가드 — 같은 아바타의 생성 잡이 생성검수에서 이미 환불(admin_decision='reject')됐으면
    // 반환 보상을 또 주지 않고 요청을 종결한다(#173 사고: 반환 신청 38초 뒤 환불만 처리가 겹침).
    const cid = characterIdFromSpriteUrl(req.spriteUrl);
    if (cid) {
      const [job] = await tx
        .select({ id: profileGenerationJobs.id, adminDecision: profileGenerationJobs.adminDecision })
        .from(profileGenerationJobs)
        .where(eq(profileGenerationJobs.pixellabCharacterId, cid))
        .limit(1);
      if (job?.adminDecision === 'reject') {
        await tx
          .update(avatarReturnRequests)
          .set({
            status: 'closed',
            refundDiamond: 0n,
            adminNote: `생성검수 환불 기처리(잡 ${job.id}) — 이중 지급 방지 자동 종결`,
            decidedAt: new Date(),
          })
          .where(eq(avatarReturnRequests.id, id));
        revalidatePath('/admin/avatar-returns');
        return { status: 'error', code: 'ALREADY_REFUNDED_BY_REVIEW' };
      }
    }

    const paid = Number(req.paidDiamond);
    const refund = outcome === 'full' ? paid : Math.floor(paid / 2);
    await tx.insert(mailbox).values({
      userId: req.userId,
      serverId: req.serverId,
      type: 'reward',
      title: '아바타 반환 보상',
      body:
        outcome === 'full'
          ? '반환하신 아바타를 확인했습니다. 생성 결과에 문제가 있어 생성에 사용한 다이아 전액을 반환 보상으로 돌려드립니다.'
          : '반환하신 아바타를 확인했습니다. 생성 결과에 문제가 없어 생성에 사용한 다이아의 절반을 반환 보상으로 지급합니다.',
      senderLabel: '운영팀',
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
