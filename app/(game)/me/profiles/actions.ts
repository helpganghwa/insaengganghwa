'use server';

import { revalidatePath } from 'next/cache';
import { and, count, desc, eq, ne } from 'drizzle-orm';
import { z } from 'zod';

import { getSessionUserId } from '@/lib/auth/session';
import { actionBlock } from '@/lib/game/action-gate';
import { rateLimited } from '@/lib/ratelimit';
import { db } from '@/lib/db/client';
import { characters } from '@/lib/db/schema/server';
import { getActiveServerId } from '@/lib/game/servers';
import { userProfiles } from '@/lib/db/schema/avatar';

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

/** 본인 소유 프로필인지 확인 — 아니면 null. serverId 지정 시 그 서버 자산인지도 검증. */
async function ownedProfileId(
  userId: string,
  profileId: string,
  serverId?: number,
): Promise<string | null> {
  const [row] = await db
    .select({ id: userProfiles.id })
    .from(userProfiles)
    .where(
      and(
        eq(userProfiles.id, profileId),
        eq(userProfiles.userId, userId),
        serverId != null ? eq(userProfiles.serverId, serverId) : undefined,
      ),
    )
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
  if (await rateLimited(userId, 'profileEdit'))
    return { status: 'error', message: '잠시 후 다시 시도해 주세요.' };
  const __b = await actionBlock();
  if (__b) return { status: 'error', message: __b === 'BANNED' ? '이용이 제한된 계정입니다.' : '서버 점검 중입니다.' };

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
  if (await rateLimited(userId, 'profileEdit'))
    return { status: 'error', message: '잠시 후 다시 시도해 주세요.' };
  const __b = await actionBlock();
  if (__b) return { status: 'error', message: __b === 'BANNED' ? '이용이 제한된 계정입니다.' : '서버 점검 중입니다.' };

  // 아바타는 서버별 자산(2000💎도 그 서버 지갑에서 차감) — 다른 서버 아바타를
  // 활성 서버 캐릭터 대표로 다는 교차 설정 차단.
  const serverId = await getActiveServerId();
  if (!(await ownedProfileId(userId, profileId, serverId)))
    return { status: 'error', message: '아바타를 찾을 수 없습니다.' };

  await db
    .update(characters)
    .set({ activeProfileId: profileId })
    .where(and(eq(characters.userId, userId), eq(characters.serverId, serverId)));

  revalidatePath('/me');
  revalidatePath('/me/profiles');
  return { status: 'ok' };
}

/** 프로필 삭제(본인). 대표였으면 대표 해제. (hidden 처리는 운영자 전용, 여긴 hard delete) */
export async function deleteProfile(profileId: string): Promise<ActionState> {
  const userId = await getSessionUserId();
  if (!userId) return { status: 'error', message: '로그인이 필요합니다.' };
  if (await rateLimited(userId, 'profileEdit'))
    return { status: 'error', message: '잠시 후 다시 시도해 주세요.' };
  const __b = await actionBlock();
  if (__b) return { status: 'error', message: __b === 'BANNED' ? '이용이 제한된 계정입니다.' : '서버 점검 중입니다.' };
  if (!(await ownedProfileId(userId, profileId)))
    return { status: 'error', message: '아바타를 찾을 수 없습니다.' };

  // 최소 1개 보유(같은 서버 내) — 마지막 프로필은 삭제 불가.
  const [target] = await db
    .select({ serverId: userProfiles.serverId, options: userProfiles.options })
    .from(userProfiles)
    .where(and(eq(userProfiles.id, profileId), eq(userProfiles.userId, userId)))
    .limit(1);
  if (!target) return { status: 'error', message: '아바타를 찾을 수 없습니다.' };
  // 기본 아바타(대장장이)는 삭제 불가 — 신고 처리 시 폴백으로 보존.
  if ((target.options as { isDefault?: boolean } | null)?.isDefault === true) {
    return { status: 'error', message: '기본 아바타는 삭제할 수 없습니다.' };
  }
  const [c] = await db
    .select({ n: count() })
    .from(userProfiles)
    .where(and(eq(userProfiles.userId, userId), eq(userProfiles.serverId, target.serverId)));
  if ((c?.n ?? 0) <= 1)
    return { status: 'error', message: '아바타는 최소 1개 이상 보유해야 합니다.' };

  await db.transaction(async (tx) => {
    // 활성 프로필을 지웠으면 같은 서버 남은 프로필(최신)로 자동 승계(감사 P5) — null 방치 시
    // 아바타 없음 상태가 됨. ⚠️ characters.active_profile_id FK가 on delete set null이라, 삭제를
    // 먼저 하면 활성이 자동 null로 풀려 승계 조건(activeProfileId=profileId)이 0행이 됨 → 반드시
    // 삭제 前 재할당. 삭제 대상은 ne로 제외(최소 1개 강제라 승계 대상 보통 존재, 마지막 1개면 null 폴백).
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
      .set({ activeProfileId: next?.id ?? null })
      .where(and(eq(characters.userId, userId), eq(characters.activeProfileId, profileId)));
    await tx
      .delete(userProfiles)
      .where(and(eq(userProfiles.id, profileId), eq(userProfiles.userId, userId)));
  });

  revalidatePath('/me');
  revalidatePath('/me/profiles');
  return { status: 'ok' };
}
