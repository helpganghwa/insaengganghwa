'use server';

import { revalidatePath } from 'next/cache';
import { and, eq, isNull, sql } from 'drizzle-orm';

import { requireAdmin } from '@/lib/auth/require-admin';
import { db } from '@/lib/db/client';
import { profiles } from '@/lib/db/schema/profiles';
import { characters } from '@/lib/db/schema/server';
import { mailbox } from '@/lib/db/schema/mailbox';
import { enhancementJobs } from '@/lib/db/schema/enhance';
import { GEM_TO_MS } from '@/lib/game/balance';
import { removeUserFromBoards, restoreUserBoards } from '@/lib/game/leaderboard/incremental';

type Result = { status: 'success' } | { status: 'error'; code: string };

// 취소 피해 보상 상한 — 오지급 방어. 정상적 산정치는 수천 규모, 이 이상은 수기 우편으로.
const COMP_MAX_DIAMOND = 100_000;

/**
 * 유저 단위 제재 액션 — 신고 접수 없이도 선제 조치 가능(결제 어뷰징·매크로 등).
 * 신고 경유 제재는 /admin/reports가 담당(신고 정리 동반), 여긴 userId 직접 대상.
 */
export async function banUserAction(
  userId: string,
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
  const updated = await db
    .update(profiles)
    .set({ bannedAt: new Date(), banReason: reason.trim().slice(0, 500), banUntil: until })
    .where(eq(profiles.id, userId))
    .returning({ id: profiles.id });
  if (updated.length === 0) return { status: 'error', code: 'NOT_FOUND' };
  // 리더보드 즉시 제외(v2) — 읽기 경로에 밴 조인을 두지 않는 대가로 쓰기 시점 삭제.
  // 실패해도 시간별 전체 재계산(밴 제외 술어)이 교정.
  await removeUserFromBoards(userId).catch((e) => console.warn('[ban] board remove failed', e));
  revalidatePath('/admin/users');
  return { status: 'success' };
}

export async function unbanUserAction(userId: string): Promise<Result> {
  await requireAdmin();
  const updated = await db
    .update(profiles)
    .set({ bannedAt: null, banReason: null, banUntil: null })
    .where(eq(profiles.id, userId))
    .returning({ id: profiles.id });
  if (updated.length === 0) return { status: 'error', code: 'NOT_FOUND' };
  // 리더보드 복원(v2) — 캐릭터 보유 전 서버의 값을 유저 스코프로 재계산.
  try {
    const chars = await db
      .select({ serverId: characters.serverId })
      .from(characters)
      .where(eq(characters.userId, userId));
    for (const c of chars) await restoreUserBoards(userId, c.serverId);
  } catch (e) {
    console.warn('[unban] board restore failed (cron이 교정)', e);
  }
  revalidatePath('/admin/users');
  return { status: 'success' };
}

/**
 * 강화 취소 피해 보상 우편 발송 — 취소된 잡의 진행 소실(cancelled_at − started_at) 합계를
 * 보석 단축 환율(1분=1💎)로 환산해 다이아 우편 지급. 금액은 화면 표기와 무관하게 서버에서
 * 재계산(클라 신뢰 금지)하고 상한 클램프. 유저 정상 취소가 섞일 수 있어 운영 판단 후 클릭하는 도구.
 * 멱등(0106): 보상한 잡은 cancel_compensated_at 마킹 — 재클릭은 그 후 새 취소분만 집계한다.
 */
export async function compensateCancelDamageAction(userId: string): Promise<Result> {
  await requireAdmin();
  const [p] = await db
    .select({ sid: profiles.lastServerId })
    .from(profiles)
    .where(eq(profiles.id, userId))
    .limit(1);
  if (!p) return { status: 'error', code: 'NOT_FOUND' };

  const compensated = await db.transaction(async (tx) => {
    // 조건부 클레임 — 미보상 취소 잡만 마킹하며 집계. 동시/반복 클릭은 0행 → 재지급 없음.
    const jobs = await tx
      .update(enhancementJobs)
      .set({ cancelCompensatedAt: sql`now()` })
      .where(
        and(
          eq(enhancementJobs.userId, userId),
          eq(enhancementJobs.status, 'cancelled'),
          isNull(enhancementJobs.cancelCompensatedAt),
        ),
      )
      .returning({ startedAt: enhancementJobs.startedAt, cancelledAt: enhancementJobs.cancelledAt });
    const lostMs = jobs.reduce(
      (s, j) => s + (j.cancelledAt ? Math.max(0, j.cancelledAt.getTime() - j.startedAt.getTime()) : 0),
      0,
    );
    const diamond = Math.min(COMP_MAX_DIAMOND, Math.ceil(lostMs / GEM_TO_MS));
    // 보상할 게 없으면 롤백 — 마킹도 되돌려 다음 실제 보상 시 정상 집계.
    if (diamond <= 0) return 0;

    await tx.insert(mailbox).values({
      userId,
      serverId: p.sid ?? 1,
      type: 'reward',
      title: '강화 진행 보상',
      body: `강화 취소로 손실된 진행 시간(약 ${Math.round(lostMs / 60_000)}분)에 대한 보상입니다. 불편을 드려 죄송합니다.`,
      senderLabel: '운영팀',
      payload: { diamond },
    });
    return diamond;
  });
  if (compensated <= 0) return { status: 'error', code: 'NOTHING_TO_COMPENSATE' };
  revalidatePath('/admin/users');
  return { status: 'success' };
}

export async function warnUserAction(userId: string): Promise<Result> {
  await requireAdmin();
  const [p] = await db
    .select({ sid: profiles.lastServerId })
    .from(profiles)
    .where(eq(profiles.id, userId))
    .limit(1);
  if (!p) return { status: 'error', code: 'NOT_FOUND' };
  await db.insert(mailbox).values({
    userId,
    serverId: p.sid ?? 1,
    type: 'notice',
    title: '운영 경고',
    body: '운영정책 위반이 확인되었습니다. 반복 시 닉네임 초기화·아바타 변경·계정 정지로 이어질 수 있으니 유의해 주세요.',
    senderLabel: '운영팀',
    payload: {},
  });
  revalidatePath('/admin/users');
  return { status: 'success' };
}
