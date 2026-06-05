import 'server-only';

import { and, count, eq, isNotNull, type SQL } from 'drizzle-orm';
import type { PgTable } from 'drizzle-orm/pg-core';

import { db } from '@/lib/db/client';
import { profiles } from '@/lib/db/schema/profiles';
import { userEquipment } from '@/lib/db/schema/equipment';
import { enhancementJobs, enhancementLogs } from '@/lib/db/schema/enhance';

/**
 * 신규 가입자 튜토리얼(스포트라이트 코치마크) — 단계는 **게임 상태에서 파생**해
 * 재진입/새로고침에도 정확히 복원. 별도 진행 컬럼 없이 보유 장비·장착·강화 신호로 결정.
 *
 * profiles.tutorial_step: 가입 트리거가 ACTIVE(1)로 세팅 → 노출 대상.
 * 모든 단계 충족 또는 스킵 시 DONE(9)으로 마킹 → 이후 노출 안 함.
 */
export const TUTORIAL_ACTIVE = 1;
export const TUTORIAL_DONE = 9;

export type TutorialStep = 'open' | 'equip' | 'enhance';

async function rowCount(table: PgTable, where: SQL | undefined): Promise<number> {
  const [r] = await db.select({ c: count() }).from(table).where(where);
  return Number(r?.c ?? 0);
}

/** 현재 튜토리얼 단계. 비활성(완료/스킵)이면 null. 실패 시에도 null(앱 안전). */
export async function getTutorialStep(userId: string): Promise<TutorialStep | null> {
  try {
    const [p] = await db
      .select({ s: profiles.tutorialStep })
      .from(profiles)
      .where(eq(profiles.id, userId));
    if (!p || p.s !== TUTORIAL_ACTIVE) return null;

    const [eqC, equippedC, jobC, logC] = await Promise.all([
      rowCount(userEquipment, eq(userEquipment.userId, userId)),
      rowCount(
        userEquipment,
        and(eq(userEquipment.userId, userId), isNotNull(userEquipment.equippedSlot)),
      ),
      rowCount(enhancementJobs, eq(enhancementJobs.userId, userId)),
      rowCount(enhancementLogs, eq(enhancementLogs.userId, userId)),
    ]);

    if (eqC <= 0) return 'open';
    if (equippedC <= 0) return 'equip';
    if (jobC + logC <= 0) return 'enhance';

    // 전 단계 충족 → 완료 마킹(1회). 조건부 update로 경쟁 안전.
    await db
      .update(profiles)
      .set({ tutorialStep: TUTORIAL_DONE })
      .where(and(eq(profiles.id, userId), eq(profiles.tutorialStep, TUTORIAL_ACTIVE)));
    return null;
  } catch {
    return null;
  }
}

/** 사용자가 '건너뛰기' — 완료로 마킹. */
export async function finishTutorial(userId: string): Promise<void> {
  await db
    .update(profiles)
    .set({ tutorialStep: TUTORIAL_DONE })
    .where(and(eq(profiles.id, userId), eq(profiles.tutorialStep, TUTORIAL_ACTIVE)));
}
