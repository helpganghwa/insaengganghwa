import 'server-only';

import { and, count, eq, inArray, isNotNull, type SQL } from 'drizzle-orm';
import type { PgTable } from 'drizzle-orm/pg-core';

import { db } from '@/lib/db/client';
import { characters } from '@/lib/db/schema/server';
import { DEFAULT_SERVER_ID } from '@/lib/game/servers';
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
export type TutorialPhase = 'intro' | 'active' | 'done';
/** 서버는 **첫 진입 1회**만 호출 — 이후 진행은 클라 상태머신(로컬). step은 재개용 초기값. */
export type TutorialState = { phase: TutorialPhase; step: TutorialStep | null };

async function rowCount(table: PgTable, where: SQL | undefined): Promise<number> {
  const [r] = await db.select({ c: count() }).from(table).where(where);
  return Number(r?.c ?? 0);
}

/** 튜토리얼 진입 상태(1회). intro=팝업, active=진행(재개 단계 포함), done=없음. 실패 시 done. */
export async function getTutorialState(userId: string): Promise<TutorialState> {
  try {
    const [p] = await db
      .select({ s: characters.tutorialStep })
      .from(characters)
      .where(and(eq(characters.userId, userId), eq(characters.serverId, DEFAULT_SERVER_ID)));
    if (!p) return { phase: 'done', step: null };
    if (p.s === TUTORIAL_INTRO) return { phase: 'intro', step: null };
    if (p.s !== TUTORIAL_ACTIVE) return { phase: 'done', step: null };

    // active — localStorage가 비었을 때의 재개 단계만 파생(클라가 우선).
    const [eqC, equippedC, jobC, logC] = await Promise.all([
      rowCount(
        userEquipment,
        and(eq(userEquipment.userId, userId), eq(userEquipment.serverId, DEFAULT_SERVER_ID)),
      ),
      rowCount(
        userEquipment,
        and(
          eq(userEquipment.userId, userId),
          eq(userEquipment.serverId, DEFAULT_SERVER_ID),
          isNotNull(userEquipment.equippedSlot),
        ),
      ),
      rowCount(
        enhancementJobs,
        and(eq(enhancementJobs.userId, userId), eq(enhancementJobs.serverId, DEFAULT_SERVER_ID)),
      ),
      rowCount(
        enhancementLogs,
        and(eq(enhancementLogs.userId, userId), eq(enhancementLogs.serverId, DEFAULT_SERVER_ID)),
      ),
    ]);

    if (eqC <= 0) return { phase: 'active', step: 'open' };
    if (equippedC <= 0) return { phase: 'active', step: 'equip' };
    if (jobC <= 0 && logC <= 0) return { phase: 'active', step: 'enhance' };
    if (logC <= 0) return { phase: 'active', step: 'attempt' };

    // 강화 수행 완료(log 존재) → DONE 마킹(완료 모달을 못 닫은 경우·다른 브라우저처럼
    // localStorage가 없는 경우의 안전망). 이후 어느 브라우저에서도 튜토리얼 미노출.
    await db
      .update(characters)
      .set({ tutorialStep: TUTORIAL_DONE })
      .where(
        and(
          eq(characters.userId, userId),
          eq(characters.serverId, DEFAULT_SERVER_ID),
          eq(characters.tutorialStep, TUTORIAL_ACTIVE),
        ),
      );
    return { phase: 'done', step: null };
  } catch {
    return { phase: 'done', step: null };
  }
}

/** 인트로 '시작' — ACTIVE로 전환(코치 시작). */
export async function startTutorial(userId: string): Promise<void> {
  await db
    .update(characters)
    .set({ tutorialStep: TUTORIAL_ACTIVE })
    .where(
      and(
        eq(characters.userId, userId),
        eq(characters.serverId, DEFAULT_SERVER_ID),
        eq(characters.tutorialStep, TUTORIAL_INTRO),
      ),
    );
}

/** '건너뛰기'/완료 — DONE으로 마킹(인트로·진행 중 모두). */
export async function finishTutorial(userId: string): Promise<void> {
  await db
    .update(characters)
    .set({ tutorialStep: TUTORIAL_DONE })
    .where(
      and(
        eq(characters.userId, userId),
        eq(characters.serverId, DEFAULT_SERVER_ID),
        inArray(characters.tutorialStep, [TUTORIAL_INTRO, TUTORIAL_ACTIVE]),
      ),
    );
}
