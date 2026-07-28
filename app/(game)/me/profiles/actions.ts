'use server';

import { markChallengeEvent } from '@/lib/game/challenges/events';
import { revalidatePath } from 'next/cache';
import { and, count, desc, eq, ne } from 'drizzle-orm';

import { getSessionUserId } from '@/lib/auth/session';
import { actionBlock } from '@/lib/game/action-gate';
import { rateLimited } from '@/lib/ratelimit';
import { db } from '@/lib/db/client';
import { characters } from '@/lib/db/schema/server';
import { getActiveServerId } from '@/lib/game/servers';
import { userProfiles } from '@/lib/db/schema/avatar';
import { runes } from '@/lib/db/schema/rune';
import { walletTrySpend } from '@/lib/game/wallet';
import { GEM_TO_MS, RUNE_SWAP_COOLDOWN_MS } from '@/lib/game/balance';

/**
 * PROFILE §8.2 — 프로필 선택화면 액션. 모두 본인 소유 프로필만 대상.
 * 아바타는 정면(south) 고정 — 방향 회전 없음(대표 선택/삭제만).
 */
type ActionState = { status: 'ok' } | { status: 'error'; message: string };

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

/** 이 프로필을 대표(active) 프로필로 설정. */
export async function setActiveProfile(profileId: string): Promise<ActionState> {
  const userId = await getSessionUserId();
  if (!userId) return { status: 'error', message: '로그인이 필요합니다.' };
  if (await rateLimited(userId, 'profileEdit'))
    return { status: 'error', message: '잠시 후 다시 시도해 주세요.' };
  const __b = await actionBlock();
  if (__b) return { status: 'error', message: __b === 'BANNED' ? '이용이 제한된 계정입니다.' : '서버 점검 중입니다.' };

  // 아바타는 서버별 자산(생성비도 그 서버 지갑에서 차감) — 다른 서버 아바타를
  // 활성 서버 캐릭터 대표로 다는 교차 설정 차단.
  const serverId = await getActiveServerId();
  if (!(await ownedProfileId(userId, profileId, serverId)))
    return { status: 'error', message: '아바타를 찾을 수 없습니다.' };

  await db
    .update(characters)
    .set({ activeProfileId: profileId })
    .where(and(eq(characters.userId, userId), eq(characters.serverId, serverId)));
  // 도전 과제(0118) — 아바타 변경 마킹(멱등·best-effort).
  await markChallengeEvent(db, userId, serverId, 'avatar_change');

  revalidatePath('/me');
  revalidatePath('/me/profiles');
  return { status: 'ok' };
}

/** 대표(외형) 해제 — 아바타 없음 상태 허용(I안 그리드: 적용/해제 토글). */
export async function clearActiveProfile(): Promise<ActionState> {
  const userId = await getSessionUserId();
  if (!userId) return { status: 'error', message: '로그인이 필요합니다.' };
  if (await rateLimited(userId, 'profileEdit'))
    return { status: 'error', message: '잠시 후 다시 시도해 주세요.' };
  const __b = await actionBlock();
  if (__b) return { status: 'error', message: __b === 'BANNED' ? '이용이 제한된 계정입니다.' : '서버 점검 중입니다.' };

  const serverId = await getActiveServerId();
  await db
    .update(characters)
    .set({ activeProfileId: null })
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
    // 속성(0141)은 아바타 종속 — cascade 삭제 前 장착 참조를 해제(댕글링 방지).
    // rune_changed_at은 유지: 삭제→재적용으로 교체 쿨을 우회하지 못하게 한다.
    const [attr] = await tx
      .select({ id: runes.id })
      .from(runes)
      .where(eq(runes.sourceProfileId, profileId))
      .limit(1);
    if (attr) {
      await tx
        .update(characters)
        .set({ equippedRuneId: null })
        .where(and(eq(characters.userId, userId), eq(characters.equippedRuneId, attr.id)));
    }
    await tx
      .delete(userProfiles)
      .where(and(eq(userProfiles.id, profileId), eq(userProfiles.userId, userId)));
  });

  revalidatePath('/me');
  revalidatePath('/me/profiles');
  return { status: 'ok' };
}

/**
 * 이 아바타의 속성을 전투 적용(0141) — 캐릭터당 1개. 최초 적용 무쿨, 교체는 24h 쿨
 * (잔여분 1💎=1분 정산 후 즉시 교체). 쿨 판정은 rune_changed_at 기준 — 적용 중이던
 * 아바타를 삭제해도(equipped null) 쿨은 유지되어 삭제로 우회할 수 없다.
 */
export async function applyAttrProfile(
  profileId: string,
  useGems = false,
): Promise<
  | { status: 'success'; gemsSpent: number }
  | { status: 'cooldown'; remainingMs: number; gemCost: number }
  | { status: 'error'; message: string }
> {
  const userId = await getSessionUserId();
  if (!userId) return { status: 'error', message: '로그인이 필요합니다.' };
  if (await rateLimited(userId, 'profileEdit'))
    return { status: 'error', message: '잠시 후 다시 시도해 주세요.' };
  const __b = await actionBlock();
  if (__b) return { status: 'error', message: __b === 'BANNED' ? '이용이 제한된 계정입니다.' : '서버 점검 중입니다.' };

  const serverId = await getActiveServerId();
  try {
    const res = await db.transaction(async (tx) => {
      // 캐릭터 행 잠금 — 동시 적용 경합 직렬화(쿨 이중우회 방지).
      const [ch] = await tx
        .select({ equipped: characters.equippedRuneId, changedAt: characters.runeChangedAt })
        .from(characters)
        .where(and(eq(characters.userId, userId), eq(characters.serverId, serverId)))
        .for('update');
      if (!ch) return { status: 'error' as const, message: '캐릭터를 찾을 수 없습니다.' };

      // 내 아바타(같은 서버)의 속성만.
      const [attr] = await tx
        .select({ id: runes.id })
        .from(runes)
        .innerJoin(userProfiles, eq(userProfiles.id, runes.sourceProfileId))
        .where(
          and(
            eq(runes.sourceProfileId, profileId),
            eq(userProfiles.userId, userId),
            eq(userProfiles.serverId, serverId),
          ),
        )
        .limit(1);
      if (!attr) return { status: 'error' as const, message: '속성을 찾을 수 없습니다.' };

      if (ch.equipped === attr.id) return { status: 'success' as const, gemsSpent: 0 }; // 이미 적용(no-op)

      let gemsSpent = 0;
      if (ch.changedAt != null) {
        const remainingMs = ch.changedAt.getTime() + RUNE_SWAP_COOLDOWN_MS - Date.now();
        if (remainingMs > 0) {
          const gemCost = Math.ceil(remainingMs / GEM_TO_MS);
          if (!useGems) return { status: 'cooldown' as const, remainingMs, gemCost };
          const paid = await walletTrySpend(tx, userId, serverId, gemCost);
          if (!paid) return { status: 'error' as const, message: '다이아가 부족합니다.' };
          gemsSpent = gemCost;
        }
      }

      await tx
        .update(characters)
        .set({ equippedRuneId: attr.id, runeChangedAt: new Date() })
        .where(and(eq(characters.userId, userId), eq(characters.serverId, serverId)));
      return { status: 'success' as const, gemsSpent };
    });
    if (res.status === 'success') {
      revalidatePath('/me');
      revalidatePath('/me/profiles');
    }
    return res;
  } catch (e) {
    console.error('[attr.apply]', e);
    return { status: 'error', message: '잠시 후 다시 시도해 주세요.' };
  }
}
