'use server';

import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';

import { requireAdmin } from '@/lib/auth/require-admin';
import { db } from '@/lib/db/client';
import { profileGenerationJobs, userProfiles } from '@/lib/db/schema/avatar';
import { characters } from '@/lib/db/schema/server';
import { mailbox } from '@/lib/db/schema/mailbox';
import { walletAdd } from '@/lib/game/wallet';

/**
 * 통과 아바타 회수 + 다이아 환불 (분쟁 처리).
 * - user_profile 삭제 + (대표였다면) active 해제 → 유저 컬렉션/표시에서 회수
 * - escrow 다이아 환불(walletAdd)
 * - 잡에 회수 사유 기록 + 운영자 우편 통지
 */
export async function adminRevokeAndRefund(jobId: string): Promise<{ ok: boolean; msg?: string }> {
  await requireAdmin();
  const [job] = await db
    .select()
    .from(profileGenerationJobs)
    .where(eq(profileGenerationJobs.id, BigInt(jobId)))
    .limit(1);
  if (!job) return { ok: false, msg: '작업을 찾을 수 없습니다.' };
  if (!job.userProfileId) return { ok: false, msg: '연결된 아바타가 없습니다(통과 건 아님/이미 회수됨).' };
  const profileId = job.userProfileId;

  await db.transaction(async (tx) => {
    await tx
      .update(characters)
      .set({ activeProfileId: null })
      .where(
        and(
          eq(characters.userId, job.userId),
          eq(characters.serverId, job.serverId),
          eq(characters.activeProfileId, profileId),
        ),
      );
    await tx.delete(userProfiles).where(eq(userProfiles.id, profileId));
    await walletAdd(tx, job.userId, job.serverId, job.diamondEscrow);
    await tx
      .update(profileGenerationJobs)
      .set({
        userProfileId: null,
        rejectReason: '운영자 회수(분쟁) — 다이아 환불',
        adminDecision: 'reject',
        adminReviewedAt: new Date(),
      })
      .where(eq(profileGenerationJobs.id, job.id));
    await tx.insert(mailbox).values({
      userId: job.userId,
      serverId: job.serverId,
      type: 'admin',
      title: '아바타 회수 안내 (다이아 환불 완료)',
      body: `안녕하세요, 운영팀입니다.\n\n생성하신 아바타가 운영 검수 결과 게임 내 표시 기준에 부합하지 않아 부득이하게 회수되었습니다.\n사용하신 다이아 ${job.diamondEscrow.toString()}개는 전액 환불해 드렸으며, 환불 다이아로 언제든 다시 생성하실 수 있습니다.\n\n불편을 드려 진심으로 죄송합니다. 더 좋은 결과로 보답하겠습니다.`,
      senderLabel: '운영자',
      payload: {},
    });
  });
  revalidatePath('/admin/profile-gen');
  return { ok: true };
}

/**
 * 다이아 보상 지급 (차감 없음) — 실패/분쟁 보상용.
 * escrow 금액을 그대로 지급(walletAdd) + 운영자 우편 통지. 차감 행위 아님(순수 지급).
 */
export async function adminGrantDiamonds(jobId: string): Promise<{ ok: boolean; msg?: string }> {
  await requireAdmin();
  const [job] = await db
    .select()
    .from(profileGenerationJobs)
    .where(eq(profileGenerationJobs.id, BigInt(jobId)))
    .limit(1);
  if (!job) return { ok: false, msg: '작업을 찾을 수 없습니다.' };

  await db.transaction(async (tx) => {
    await walletAdd(tx, job.userId, job.serverId, job.diamondEscrow);
    await tx
      .update(profileGenerationJobs)
      .set({ adminDecision: 'grant', adminReviewedAt: new Date() })
      .where(eq(profileGenerationJobs.id, job.id));
    await tx.insert(mailbox).values({
      userId: job.userId,
      serverId: job.serverId,
      type: 'admin',
      title: '아바타 생성 보상 안내',
      body: `안녕하세요, 운영팀입니다.\n\n아바타 생성 과정에서 만족스러운 결과를 받지 못하신 점 확인하였습니다.\n불편을 드린 데 대한 보상으로 다이아 ${job.diamondEscrow.toString()}개를 지급해 드렸습니다.\n\n지급된 다이아로 다시 생성에 도전해 주세요. 이용해 주셔서 감사합니다.`,
      senderLabel: '운영자',
      payload: {},
    });
  });
  revalidatePath('/admin/profile-gen');
  return { ok: true };
}

/**
 * 확인(무조치) — AI 결정에 동의, 사용자 영향/우편 없음. 검수 완료 표시만 기록.
 * 날짜별 점검 시 "검수함"으로 분류돼 미검수 건과 구분된다.
 */
export async function adminConfirmReview(jobId: string): Promise<{ ok: boolean; msg?: string }> {
  await requireAdmin();
  await db
    .update(profileGenerationJobs)
    .set({ adminDecision: 'confirm', adminReviewedAt: new Date() })
    .where(eq(profileGenerationJobs.id, BigInt(jobId)));
  revalidatePath('/admin/profile-gen');
  return { ok: true };
}
