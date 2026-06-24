'use server';

import { eq, sql } from 'drizzle-orm';
import { z } from 'zod';

import { getSessionUserId } from '@/lib/auth/session';
import { db } from '@/lib/db/client';
import { userProfiles, profileReports } from '@/lib/db/schema/avatar';

/**
 * PROFILE §7.1 — 프로필 신고. 사후 신고(자동 차단 X), count 누적만.
 * 운영자가 /admin/reports에서 신고 많은 순으로 보고 수동 조치(§7.2).
 */
type ReportState = { status: 'ok' } | { status: 'error'; message: string };

// 신고 사유 카테고리(2026-06-01) — 부적절 닉네임/아바타/버그 악용/기타 4종.
const REASONS = ['nickname', 'avatar', 'bug_abuse', 'other'] as const;
const ReasonSchema = z.enum(REASONS);
// 상세 내용(note)을 저장하는 사유 — 기타 + 버그 악용.
const NOTE_REASONS = new Set<(typeof REASONS)[number]>(['other', 'bug_abuse']);

export async function reportProfile(
  profileId: string,
  reason: string,
  note?: string,
): Promise<ReportState> {
  const userId = await getSessionUserId();
  if (!userId) return { status: 'error', message: '로그인이 필요합니다.' };

  const parsed = ReasonSchema.safeParse(reason);
  if (!parsed.success) return { status: 'error', message: '신고 사유를 선택해 주세요.' };

  // 대상 프로필 + 소유자 확인 (본인 신고 차단).
  const [p] = await db
    .select({ ownerId: userProfiles.userId })
    .from(userProfiles)
    .where(eq(userProfiles.id, profileId))
    .limit(1);
  if (!p) return { status: 'error', message: '프로필을 찾을 수 없습니다.' };
  if (p.ownerId === userId)
    return { status: 'error', message: '본인 프로필은 신고할 수 없습니다.' };

  try {
    await db.transaction(async (tx) => {
      // UNIQUE(profile_id, reporter_user_id, reason) — 같은 사유 중복만 23505(사유 다르면 허용).
      await tx.insert(profileReports).values({
        profileId,
        reporterUserId: userId,
        reason: parsed.data,
        // 기타·버그 악용은 상세 내용 저장(운영자 판단 근거).
        note: NOTE_REASONS.has(parsed.data) ? (note?.slice(0, 200) ?? null) : null,
      });
      await tx
        .update(userProfiles)
        .set({ reportCount: sql`${userProfiles.reportCount} + 1` })
        .where(eq(userProfiles.id, profileId));
    });
  } catch (e) {
    if ((e as { code?: string }).code === '23505') {
      return { status: 'error', message: '이미 같은 사유로 신고한 프로필입니다.' };
    }
    throw e;
  }
  return { status: 'ok' };
}
