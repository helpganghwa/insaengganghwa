'use server';

import { revalidatePath } from 'next/cache';
import { and, eq, sql } from 'drizzle-orm';

import { requireAdmin } from '@/lib/auth/require-admin';
import { db } from '@/lib/db/client';
import { userProfiles, profileReports } from '@/lib/db/schema/avatar';
import { characters } from '@/lib/db/schema/server';
import { profiles } from '@/lib/db/schema/profiles';
import { mailbox } from '@/lib/db/schema/mailbox';
import { NICKNAME_CHANGE_COST_DIAMOND, PROFILE_GENERATION_DIAMOND } from '@/lib/game/balance';

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Result = { status: 'success' } | { status: 'error'; code: string };

async function ownerOf(tx: Tx, profileId: string) {
  const [p] = await tx
    .select({ userId: userProfiles.userId, serverId: userProfiles.serverId, options: userProfiles.options })
    .from(userProfiles)
    .where(eq(userProfiles.id, profileId))
    .limit(1);
  return p ?? null;
}

async function mail(
  tx: Tx,
  userId: string,
  serverId: number,
  type: 'notice' | 'reward',
  title: string,
  body: string,
  diamond = 0,
) {
  await tx.insert(mailbox).values({
    userId,
    serverId,
    type,
    title,
    body,
    senderLabel: '운영팀',
    payload: diamond > 0 ? { diamond } : {},
  });
}

async function clearReports(tx: Tx, profileId: string) {
  await tx.delete(profileReports).where(eq(profileReports.profileId, profileId));
  await tx.update(userProfiles).set({ reportCount: 0 }).where(eq(userProfiles.id, profileId));
}

function randomBlacksmithNick(): string {
  const n = (crypto.getRandomValues(new Uint32Array(1))[0]! % 900000) + 100000;
  return `대장장이${n}`;
}

/** 닉네임 신고 처리 — '대장장이N'으로 강제 변경 + 변경비 지급 + 신고 정리. */
export async function resetReportedNickname(profileId: string): Promise<Result> {
  await requireAdmin();
  return db.transaction(async (tx) => {
    const owner = await ownerOf(tx, profileId);
    if (!owner) return { status: 'error', code: 'NOT_FOUND' };
    // 서버 내 유니크 — 충돌 회피 재시도.
    let nick = randomBlacksmithNick();
    for (let i = 0; i < 5; i++) {
      const [dup] = await tx
        .select({ uid: characters.userId })
        .from(characters)
        .where(and(eq(characters.serverId, owner.serverId), eq(characters.nickname, nick)))
        .limit(1);
      if (!dup) break;
      nick = randomBlacksmithNick();
    }
    await tx
      .update(characters)
      .set({ nickname: nick })
      .where(and(eq(characters.userId, owner.userId), eq(characters.serverId, owner.serverId)));
    await mail(
      tx,
      owner.userId,
      owner.serverId,
      'reward',
      '닉네임 초기화 안내',
      `운영정책 위반으로 닉네임이 "${nick}"(으)로 초기화되었습니다. 닉네임 변경 비용을 지급해 드리니 적절한 닉네임으로 변경해 주세요.`,
      NICKNAME_CHANGE_COST_DIAMOND,
    );
    await clearReports(tx, profileId);
    revalidatePath('/admin/reports');
    return { status: 'success' };
  });
}

/** 아바타 신고 처리 — 기본 아바타로 전환(위반 아바타 삭제) + 생성비 지급 + 신고 정리. 기본 아바타는 삭제 안 함. */
export async function resetReportedAvatar(profileId: string): Promise<Result> {
  await requireAdmin();
  return db.transaction(async (tx) => {
    const owner = await ownerOf(tx, profileId);
    if (!owner) return { status: 'error', code: 'NOT_FOUND' };
    const isDefault = (owner.options as { isDefault?: boolean } | null)?.isDefault === true;

    if (isDefault) {
      // 기본 아바타가 신고됨 — 삭제 불가, 안내만 후 정리.
      await mail(tx, owner.userId, owner.serverId, 'notice', '신고 처리 안내', '신고가 검토되었습니다.');
      await clearReports(tx, profileId);
      revalidatePath('/admin/reports');
      return { status: 'success' };
    }

    // 이 유저의 기본 아바타로 active 전환(없으면 null=코드 폴백) 후 위반 아바타 삭제.
    const [def] = await tx
      .select({ id: userProfiles.id })
      .from(userProfiles)
      .where(
        and(
          eq(userProfiles.userId, owner.userId),
          eq(userProfiles.serverId, owner.serverId),
          sql`(${userProfiles.options} ->> 'isDefault') = 'true'`,
        ),
      )
      .limit(1);
    await tx
      .update(characters)
      .set({ activeProfileId: def?.id ?? null })
      .where(and(eq(characters.userId, owner.userId), eq(characters.activeProfileId, profileId)));
    // 신고 cascade로 함께 삭제되지만, 명시적으로 먼저 정리(카운트 0 갱신은 삭제 전 대상 존재 시).
    await tx.delete(profileReports).where(eq(profileReports.profileId, profileId));
    await tx.delete(userProfiles).where(eq(userProfiles.id, profileId));
    await mail(
      tx,
      owner.userId,
      owner.serverId,
      'reward',
      '아바타 변경 안내',
      '운영정책 위반으로 아바타가 기본 아바타로 변경되었습니다. 아바타 생성 비용을 지급해 드리니 적절한 아바타로 다시 만들어 주세요.',
      PROFILE_GENERATION_DIAMOND,
    );
    revalidatePath('/admin/reports');
    return { status: 'success' };
  });
}

/** 경고 — 비공개·변경 없이 경고 우편만(신고 기록 유지). 모든 사유 공통. */
export async function warnProfile(profileId: string): Promise<Result> {
  await requireAdmin();
  return db.transaction(async (tx) => {
    const owner = await ownerOf(tx, profileId);
    if (!owner) return { status: 'error', code: 'NOT_FOUND' };
    await mail(
      tx,
      owner.userId,
      owner.serverId,
      'notice',
      '운영 경고',
      '회원님에 대한 신고가 접수되었습니다. 운영정책 위반(부적절한 닉네임·아바타, 버그 악용 등)은 닉네임 초기화·아바타 변경·계정 정지로 이어질 수 있으니 유의해 주세요.',
    );
    revalidatePath('/admin/reports');
    return { status: 'success' };
  });
}

/** 계정 정지 — banned 마킹 + 사유(노출). 게임 접근 차단은 (game) 레이아웃 게이트가 enforce. */
export async function banReportedUser(
  profileId: string,
  reason: string,
  untilIso: string | null,
): Promise<Result> {
  await requireAdmin();
  if (!reason.trim()) return { status: 'error', code: 'NO_REASON' };
  let until: Date | null = null;
  if (untilIso) {
    // datetime-local('YYYY-MM-DDThh:mm', TZ 없음)을 KST로 해석.
    const d = new Date(`${untilIso}:00+09:00`);
    if (Number.isNaN(d.getTime())) return { status: 'error', code: 'BAD_UNTIL' };
    until = d;
  }
  return db.transaction(async (tx) => {
    const owner = await ownerOf(tx, profileId);
    if (!owner) return { status: 'error', code: 'NOT_FOUND' };
    await tx
      .update(profiles)
      .set({ bannedAt: new Date(), banReason: reason.trim().slice(0, 500), banUntil: until })
      .where(eq(profiles.id, owner.userId));
    await clearReports(tx, profileId);
    revalidatePath('/admin/reports');
    return { status: 'success' };
  });
}

/** 정지 해제 — profileId의 소유자 banned 해제. */
export async function unbanReportedUser(profileId: string): Promise<Result> {
  await requireAdmin();
  return db.transaction(async (tx) => {
    const owner = await ownerOf(tx, profileId);
    if (!owner) return { status: 'error', code: 'NOT_FOUND' };
    await tx
      .update(profiles)
      .set({ bannedAt: null, banReason: null, banUntil: null })
      .where(eq(profiles.id, owner.userId));
    revalidatePath('/admin/reports');
    return { status: 'success' };
  });
}

/** 기각 — 신고 무효(기록 삭제 + count 0). 제재·우편 없음. */
export async function dismissReports(profileId: string): Promise<Result> {
  await requireAdmin();
  await db.transaction(async (tx) => {
    await clearReports(tx, profileId);
  });
  revalidatePath('/admin/reports');
  return { status: 'success' };
}
