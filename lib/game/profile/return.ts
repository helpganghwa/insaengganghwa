import 'server-only';

import { and, count, desc, eq, ne, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { PROFILE_GENERATION_DIAMOND } from '@/lib/game/balance';
import { avatarReturnRequests, profileGenerationJobs, userProfiles } from '@/lib/db/schema/avatar';
import { characters } from '@/lib/db/schema/server';

export type AvatarReturnReason = 'equipment_mismatch' | 'quality' | 'etc';

export class AvatarReturnError extends Error {
  constructor(
    public code: 'NOT_FOUND' | 'DEFAULT_AVATAR' | 'REPORTED' | 'LAST_ONE',
  ) {
    super(code);
    this.name = 'AvatarReturnError';
  }
}

/**
 * 아바타 반환(2026-09-01) — 신청 즉시 회수(삭제) + 요청 행 적재. 운영자가 사후에
 * 전액/절반을 판단해 우편 지급한다(admin/avatar-returns).
 *
 * - 환급 기준 = **실지불액**(profile_generation_jobs.diamond_escrow): 첫 아바타 할인(500)로
 *   만들고 고정 1,000을 받는 차익 파밍 차단(2026-08-31 사용자 확정). 생성 잡이 없는
 *   아바타(CBT 이월 등)는 정가(1,000) 지불로 간주.
 * - 삭제 규칙은 기존 deleteProfile과 동일: 기본 아바타 불가·신고 처리 중 불가·최소 1개 보유·
 *   대표 삭제 시 최신 프로필로 승계. 파견 배정 중이면 expeditions.avatar_profile_id가
 *   set null로 풀리고 파견 자체는 계속 진행된다(기록 유지 — 스키마 주석 참조).
 * - 아바타 행이 사라지므로 판단 재료(스프라이트·장비 스냅샷·지불액)를 요청 행에 스냅샷.
 */
export function requestAvatarReturn(input: {
  userId: string;
  serverId: number;
  profileId: string;
  reason: AvatarReturnReason;
}): Promise<{ requestId: bigint }> {
  const { userId, serverId, profileId, reason } = input;
  return db.transaction(async (tx) => {
    const [target] = await tx
      .select({
        serverId: userProfiles.serverId,
        options: userProfiles.options,
        rotations: userProfiles.rotations,
        equipmentSnapshot: userProfiles.equipmentSnapshot,
        reportCount: userProfiles.reportCount,
      })
      .from(userProfiles)
      .where(and(eq(userProfiles.id, profileId), eq(userProfiles.userId, userId), eq(userProfiles.serverId, serverId)))
      .for('update')
      .limit(1);
    if (!target) throw new AvatarReturnError('NOT_FOUND');
    if ((target.options as { isDefault?: boolean } | null)?.isDefault === true) {
      throw new AvatarReturnError('DEFAULT_AVATAR');
    }
    // 신고 처리 중 회수는 증거 인멸 + 어드민 신고 큐 이탈(deleteProfile과 동일 근거, 2026-08-21).
    if ((target.reportCount ?? 0) > 0) throw new AvatarReturnError('REPORTED');

    const [c] = await tx
      .select({ n: count() })
      .from(userProfiles)
      .where(and(eq(userProfiles.userId, userId), eq(userProfiles.serverId, target.serverId)));
    if ((c?.n ?? 0) <= 1) throw new AvatarReturnError('LAST_ONE');

    // 실지불액 — 이 아바타를 만든 생성 잡의 escrow(거절 환불과 무관하게 accepted 잡은 지불 확정).
    const [job] = await tx
      .select({ escrow: profileGenerationJobs.diamondEscrow })
      .from(profileGenerationJobs)
      .where(eq(profileGenerationJobs.userProfileId, profileId))
      .orderBy(desc(profileGenerationJobs.id))
      .limit(1);
    const paid = job?.escrow ?? BigInt(PROFILE_GENERATION_DIAMOND);

    const rot = target.rotations as Record<string, string>;
    const [req] = await tx
      .insert(avatarReturnRequests)
      .values({
        userId,
        serverId: target.serverId,
        profileId,
        reason,
        spriteUrl: rot.south ?? Object.values(rot)[0] ?? '',
        equipmentSnapshot: target.equipmentSnapshot,
        paidDiamond: paid,
      })
      .returning({ id: avatarReturnRequests.id });

    // 대표 승계 → 삭제(deleteProfile과 동일 순서 — FK set null이 먼저 풀리면 승계 조건이 0행).
    const [next] = await tx
      .select({ id: userProfiles.id })
      .from(userProfiles)
      .where(
        and(
          eq(userProfiles.userId, userId),
          eq(userProfiles.serverId, target.serverId),
          ne(userProfiles.id, profileId),
        ),
      )
      .orderBy(desc(userProfiles.createdAt))
      .limit(1);
    await tx
      .update(characters)
      .set({ activeProfileId: next?.id ?? null, activeProfileSince: sql`now()` })
      .where(and(eq(characters.userId, userId), eq(characters.activeProfileId, profileId)));
    await tx
      .delete(userProfiles)
      .where(and(eq(userProfiles.id, profileId), eq(userProfiles.userId, userId)));

    return { requestId: req!.id };
  });
}
