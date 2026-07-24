'use server';

import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';

import { requireAdmin } from '@/lib/auth/require-admin';
import { db } from '@/lib/db/client';
import { worldChronicle } from '@/lib/db/schema/guild';

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
    // 헤드라인은 빈 값이 정상(큰 사건 없는 날 = '') — 빈 헤드라인 날에 본문 수정 저장이
    // 항상 거부되던 버그(07-17 검수 수정 미반영 사건). 본문만 필수.
    if (!todayText) return { status: 'error', message: '본문을 입력하세요.' };
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

