import 'server-only';

import { and, count, eq, inArray, isNotNull, type SQL } from 'drizzle-orm';
import type { PgTable } from 'drizzle-orm/pg-core';

import { db } from '@/lib/db/client';
import { profiles } from '@/lib/db/schema/profiles';
import { userEquipment } from '@/lib/db/schema/equipment';
import { enhancementJobs, enhancementLogs } from '@/lib/db/schema/enhance';

/**
 * 신규 가입자 튜토리얼(스포트라이트 코치마크).
 *  - INTRO(1): 가입 직후. 메인페이지에서 시작/건너뛰기 팝업 노출.
 *  - ACTIVE(2): '시작' 선택 후. 단계는 **게임 상태에서 파생**(보유 장비·장착·강화).
 *  - DONE(9): 완료 또는 건너뛰기.
 */
export const TUTORIAL_INTRO = 1;
export const TUTORIAL_ACTIVE = 2;
export const TUTORIAL_DONE = 9;

export type TutorialStep = 'open' | 'equip' | 'enhance' | 'attempt';
export type TutorialState = { intro: boolean; step: TutorialStep | null };

async function rowCount(table: PgTable, where: SQL | undefined): Promise<number> {
  const [r] = await db.select({ c: count() }).from(table).where(where);
  return Number(r?.c ?? 0);
}

/** 현재 튜토리얼 상태(인트로 노출 여부 + 코치 단계). 실패 시 비활성(앱 안전). */
export async function getTutorialState(userId: string): Promise<TutorialState> {
  try {
    const [p] = await db
      .select({ s: profiles.tutorialStep })
      .from(profiles)
      .where(eq(profiles.id, userId));
    if (!p) return { intro: false, step: null };
    if (p.s === TUTORIAL_INTRO) return { intro: true, step: null };
    if (p.s !== TUTORIAL_ACTIVE) return { intro: false, step: null };

    const [eqC, equippedC, jobC, logC] = await Promise.all([
      rowCount(userEquipment, eq(userEquipment.userId, userId)),
      rowCount(
        userEquipment,
        and(eq(userEquipment.userId, userId), isNotNull(userEquipment.equippedSlot)),
      ),
      rowCount(enhancementJobs, eq(enhancementJobs.userId, userId)),
      rowCount(enhancementLogs, eq(enhancementLogs.userId, userId)),
    ]);

    if (eqC <= 0) return { intro: false, step: 'open' };
    if (equippedC <= 0) return { intro: false, step: 'equip' };
    if (jobC <= 0 && logC <= 0) return { intro: false, step: 'enhance' }; // 큐 등록 전
    if (logC <= 0) return { intro: false, step: 'attempt' }; // 등록됨(job) but 미수행

    // 전 단계 충족 → 완료 마킹(1회).
    await db
      .update(profiles)
      .set({ tutorialStep: TUTORIAL_DONE })
      .where(and(eq(profiles.id, userId), eq(profiles.tutorialStep, TUTORIAL_ACTIVE)));
    return { intro: false, step: null };
  } catch {
    return { intro: false, step: null };
  }
}

/** 인트로 '시작' — ACTIVE로 전환(코치 시작). */
export async function startTutorial(userId: string): Promise<void> {
  await db
    .update(profiles)
    .set({ tutorialStep: TUTORIAL_ACTIVE })
    .where(and(eq(profiles.id, userId), eq(profiles.tutorialStep, TUTORIAL_INTRO)));
}

/** '건너뛰기'/완료 — DONE으로 마킹(인트로·진행 중 모두). */
export async function finishTutorial(userId: string): Promise<void> {
  await db
    .update(profiles)
    .set({ tutorialStep: TUTORIAL_DONE })
    .where(
      and(
        eq(profiles.id, userId),
        inArray(profiles.tutorialStep, [TUTORIAL_INTRO, TUTORIAL_ACTIVE]),
      ),
    );
}
