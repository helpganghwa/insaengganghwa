'use server';

import { revalidatePath } from 'next/cache';
import { and, count, eq } from 'drizzle-orm';
import { z } from 'zod';

import { getSessionUserId } from '@/lib/auth/session';
import { db } from '@/lib/db/client';
import { userProfiles } from '@/lib/db/schema/avatar';
import { profiles } from '@/lib/db/schema/profiles';

/**
 * PROFILE §8.2 — 프로필 선택화면 액션. 모두 본인 소유 프로필만 대상.
 * 선택/방향 변경이 즉시 대표·표시 방향에 반영(별도 "설정" 버튼 없음).
 */
type ActionState = { status: 'ok' } | { status: 'error'; message: string };

const DIRECTIONS = [
  'south',
  'east',
  'north',
  'west',
  'south_east',
  'north_east',
  'north_west',
  'south_west',
] as const;
const DirectionSchema = z.enum(DIRECTIONS);

/** 본인 소유 프로필인지 확인 — 아니면 null. */
async function ownedProfileId(userId: string, profileId: string): Promise<string | null> {
  const [row] = await db
    .select({ id: userProfiles.id })
    .from(userProfiles)
    .where(and(eq(userProfiles.id, profileId), eq(userProfiles.userId, userId)))
    .limit(1);
  return row?.id ?? null;
}

/** 표시 방향 변경. */
export async function setActiveDirection(
  profileId: string,
  direction: string,
): Promise<ActionState> {
  const userId = await getSessionUserId();
  if (!userId) return { status: 'error', message: '로그인이 필요합니다.' };

  const dir = DirectionSchema.safeParse(direction);
  if (!dir.success) return { status: 'error', message: '잘못된 방향입니다.' };
  if (!(await ownedProfileId(userId, profileId)))
    return { status: 'error', message: '아바타를 찾을 수 없습니다.' };

  await db
    .update(userProfiles)
    .set({ activeDirection: dir.data })
    .where(and(eq(userProfiles.id, profileId), eq(userProfiles.userId, userId)));

  revalidatePath('/me/profiles');
  revalidatePath('/me');
  return { status: 'ok' };
}

/** 이 프로필을 대표(active) 프로필로 설정. */
export async function setActiveProfile(profileId: string): Promise<ActionState> {
  const userId = await getSessionUserId();
  if (!userId) return { status: 'error', message: '로그인이 필요합니다.' };
  if (!(await ownedProfileId(userId, profileId)))
    return { status: 'error', message: '아바타를 찾을 수 없습니다.' };

  await db.update(profiles).set({ activeProfileId: profileId }).where(eq(profiles.id, userId));

  revalidatePath('/me');
  revalidatePath('/me/profiles');
  return { status: 'ok' };
}

/** 프로필 삭제(본인). 대표였으면 대표 해제. (hidden 처리는 운영자 전용, 여긴 hard delete) */
export async function deleteProfile(profileId: string): Promise<ActionState> {
  const userId = await getSessionUserId();
  if (!userId) return { status: 'error', message: '로그인이 필요합니다.' };
  if (!(await ownedProfileId(userId, profileId)))
    return { status: 'error', message: '아바타를 찾을 수 없습니다.' };

  // 최소 1개 보유 — 마지막 프로필은 삭제 불가.
  const [c] = await db
    .select({ n: count() })
    .from(userProfiles)
    .where(eq(userProfiles.userId, userId));
  if ((c?.n ?? 0) <= 1)
    return { status: 'error', message: '아바타는 최소 1개 이상 보유해야 합니다.' };

  await db.transaction(async (tx) => {
    await tx
      .update(profiles)
      .set({ activeProfileId: null })
      .where(and(eq(profiles.id, userId), eq(profiles.activeProfileId, profileId)));
    await tx
      .delete(userProfiles)
      .where(and(eq(userProfiles.id, profileId), eq(userProfiles.userId, userId)));
  });

  revalidatePath('/me');
  revalidatePath('/me/profiles');
  return { status: 'ok' };
}
