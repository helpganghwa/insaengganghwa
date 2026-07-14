'use server';

import { revalidatePath } from 'next/cache';
import { and, eq, sql } from 'drizzle-orm';

import { requireAdmin } from '@/lib/auth/require-admin';
import { db } from '@/lib/db/client';
import { worldChronicle } from '@/lib/db/schema/guild';
import { meleeBattles } from '@/lib/db/schema/melee';
import { processTrophies } from '@/lib/game/melee/trophy';

type Result = { status: 'success' } | { status: 'error'; message: string };

/**
 * 연대기 수정 — 자정 공개 전 검수 창(23:05~24:00)에서 헤드라인/본문 교정.
 * 공개 후 수정도 허용(월드 화면은 매 조회 DB 읽기 — 즉시 반영).
 */
export async function updateChronicleAction(input: {
  serverId: number;
  kstDay: string; // 'YYYY-MM-DD'
  headline: string;
  todayText: string;
}): Promise<Result> {
  try {
    await requireAdmin();
    const headline = input.headline.trim().slice(0, 200);
    const todayText = input.todayText.trim().slice(0, 4000);
    if (!headline || !todayText) return { status: 'error', message: '헤드라인/본문을 입력하세요.' };
    const rows = await db
      .update(worldChronicle)
      .set({ headline, todayText })
      .where(
        and(
          eq(worldChronicle.serverId, input.serverId),
          eq(worldChronicle.kstDay, input.kstDay),
        ),
      )
      .returning({ kstDay: worldChronicle.kstDay });
    if (rows.length === 0) return { status: 'error', message: '해당 일자 연대기가 없습니다.' };
    revalidatePath('/admin/preview');
    revalidatePath('/guild/map');
    return { status: 'success' };
  } catch (e) {
    console.error('[admin.preview] chronicle update', (e as Error).message);
    return { status: 'error', message: '저장 중 오류가 발생했습니다.' };
  }
}

/**
 * 우승 트로피 재생성 — 10시 공개 전 검수에서 결과물이 이상할 때. 상태를 초기화하면
 * melee-trophy 크론(KST 9~12시, 3분 주기)이 재생성한다. 즉시 1틱을 킥해 시작을 앞당김.
 * 트로피는 표시 전용이라 10시 이후 재생성해도 완료 즉시 교체 반영.
 */
export async function regenTrophyAction(battleId: string): Promise<Result> {
  try {
    await requireAdmin();
    const rows = await db
      .update(meleeBattles)
      .set({
        trophyStatus: null,
        trophyCharId: null,
        trophyAttempts: 0,
        trophyUpdatedAt: new Date(),
        // 기존 결과물 제거 — 재생성 완료까지 포디움은 기본(정적) 표시로 폴백.
        finale: sql`${meleeBattles.finale} - 'trophyAvatar' - 'trophyFaceBox'`,
      })
      .where(eq(meleeBattles.id, BigInt(battleId)))
      .returning({ id: meleeBattles.id });
    if (rows.length === 0) return { status: 'error', message: '해당 배틀이 없습니다.' };
    // 첫 틱 즉시 킥(생성 POST까지) — 이후 진행은 크론(3분)이 이어감. best-effort.
    await processTrophies().catch(() => {});
    revalidatePath('/admin/preview');
    return { status: 'success' };
  } catch (e) {
    console.error('[admin.preview] trophy regen', (e as Error).message);
    return { status: 'error', message: '재생성 요청 중 오류가 발생했습니다.' };
  }
}
