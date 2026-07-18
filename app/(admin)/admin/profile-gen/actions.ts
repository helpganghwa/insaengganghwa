'use server';

import { revalidatePath } from 'next/cache';
import { and, eq, sql } from 'drizzle-orm';

import { requireAdmin } from '@/lib/auth/require-admin';
import { safeBigInt } from '@/lib/util/id';
import { db } from '@/lib/db/client';
import { profileGenerationJobs, userProfiles } from '@/lib/db/schema/avatar';
import { characters } from '@/lib/db/schema/server';
import { mailbox } from '@/lib/db/schema/mailbox';
import { walletAdd } from '@/lib/game/wallet';
import { adminGrantAvatarForJob } from '@/lib/game/profile/pipeline';

/**
 * 통과 아바타 회수 + 다이아 환불 (분쟁 처리).
 * - user_profile 삭제 + (대표였다면) active 해제 → 유저 컬렉션/표시에서 회수
 * - escrow 다이아 환불(walletAdd)
 * - 잡에 회수 사유 기록 + 운영자 우편 통지
 */
export async function adminRevokeAndRefund(jobId: string): Promise<{ ok: boolean; msg?: string }> {
  await requireAdmin();
  const jid = safeBigInt(jobId);
  if (jid === null) return { ok: false, msg: '잘못된 작업 ID입니다.' };
  const [job] = await db
    .select()
    .from(profileGenerationJobs)
    .where(eq(profileGenerationJobs.id, jid))
    .limit(1);
  if (!job) return { ok: false, msg: '작업을 찾을 수 없습니다.' };
  if (!job.userProfileId) return { ok: false, msg: '연결된 아바타가 없습니다(통과 건 아님/이미 회수됨).' };
  const profileId = job.userProfileId;

  const claimed = await db.transaction(async (tx) => {
    // 조건부 클레임 먼저(money path) — 게이트(:28)는 비잠금 read라 동시 더블클릭이 둘 다
    // 통과할 수 있다. user_profile_id가 아직 그 값일 때만 전이시켜 환불을 정확히 1회로.
    const rows = await tx
      .update(profileGenerationJobs)
      .set({
        userProfileId: null,
        rejectReason: '운영자 회수(분쟁) — 다이아 환불',
        adminDecision: 'reject',
        adminReviewedAt: new Date(),
      })
      .where(and(eq(profileGenerationJobs.id, job.id), eq(profileGenerationJobs.userProfileId, profileId)))
      .returning({ id: profileGenerationJobs.id });
    if (rows.length === 0) return false;
    // 대표였다면 유저의 기본 아바타로 전환(신고 플로우 resetReportedAvatar와 동일 정책) —
    // null로만 두면 /u·랭킹 등에서 빈 영역이 표시됨(2026-07-18 바람 사례).
    const [def] = await tx
      .select({ id: userProfiles.id })
      .from(userProfiles)
      .where(
        and(
          eq(userProfiles.userId, job.userId),
          eq(userProfiles.serverId, job.serverId),
          sql`(${userProfiles.options} ->> 'isDefault') = 'true'`,
        ),
      )
      .limit(1);
    await tx
      .update(characters)
      .set({ activeProfileId: def?.id ?? null })
      .where(
        and(
          eq(characters.userId, job.userId),
          eq(characters.serverId, job.serverId),
          eq(characters.activeProfileId, profileId),
        ),
      );
    await tx.delete(userProfiles).where(eq(userProfiles.id, profileId));
    await walletAdd(tx, job.userId, job.serverId, job.diamondEscrow);
    await tx.insert(mailbox).values({
      userId: job.userId,
      serverId: job.serverId,
      type: 'admin',
      title: '아바타 회수 안내 (다이아 환불 완료)',
      body: `안녕하세요, 운영팀입니다.\n\n생성하신 아바타가 운영 검수 결과 게임 내 표시 기준에 부합하지 않아 부득이하게 회수되었습니다.\n사용하신 다이아 ${job.diamondEscrow.toString()}개는 전액 환불해 드렸으며, 환불 다이아로 언제든 다시 생성하실 수 있습니다.\n\n불편을 드려 진심으로 죄송합니다. 더 좋은 결과로 보답하겠습니다.`,
      senderLabel: '운영자',
      payload: {},
    });
    return true;
  });
  revalidatePath('/admin/profile-gen');
  if (!claimed) return { ok: false, msg: '이미 처리된 건입니다(동시 요청).' };
  return { ok: true };
}

/**
 * 아바타 지급 (다이아 차감 없음) — AI가 거절했지만 실제로 문제 없는 아바타를 직접 지급.
 * Storage 미러링 + user_profiles 생성 + 목록 추가 + 우편(pipeline.adminGrantAvatarForJob).
 * AI 거절 시 escrow는 이미 환불됐으므로 추가 차감/환불 없음(순수 지급).
 */
export async function adminGrantAvatar(jobId: string): Promise<{ ok: boolean; msg?: string }> {
  await requireAdmin();
  const jid = safeBigInt(jobId);
  if (jid === null) return { ok: false, msg: '잘못된 작업 ID입니다.' };
  const r = await adminGrantAvatarForJob(jid);
  revalidatePath('/admin/profile-gen');
  return r;
}

/**
 * 확인(무조치) — AI 결정에 동의, 사용자 영향/우편 없음. 검수 완료 표시만 기록.
 * 날짜별 점검 시 "검수함"으로 분류돼 미검수 건과 구분된다.
 */
export async function adminConfirmReview(jobId: string): Promise<{ ok: boolean; msg?: string }> {
  await requireAdmin();
  const jid = safeBigInt(jobId);
  if (jid === null) return { ok: false, msg: '잘못된 작업 ID입니다.' };
  await db
    .update(profileGenerationJobs)
    .set({ adminDecision: 'confirm', adminReviewedAt: new Date() })
    .where(eq(profileGenerationJobs.id, jid));
  revalidatePath('/admin/profile-gen');
  return { ok: true };
}
