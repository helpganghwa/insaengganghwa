// 신규/미온보딩 유저 부트스트랩 — 프로필 보장 + 스타터 1회 지급 (단일 트랜잭션, 멱등).
//
// 배경: 프로필 생성 로직 전무(콜백=세션교환, DB 트리거 없음) + 스타터 미지급 →
// 신규 유저 보급 0 = 진행 불가(소프트락). 또한 *이미 프로필이 있던* 기존 유저도
// 스타터를 못 받아 동일 차단 → "프로필 신규 생성" 기준이 아니라 **tutorial_step==0**
// 으로 게이트(GDD §4 온보딩 진행 필드). 신규/기존-미수령 모두 첫 진입 1회 지급, 이후 step=1.
// 전체 Day-1 튜토리얼(닉네임 설정 화면·강화/단축/초월 체험)은 후속(태스크 #18).

import { sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { profiles } from '@/lib/db/schema/profiles';
import { userSupplyBoxes } from '@/lib/db/schema/supply';

/** 스타터 지급량 — 튜닝 가능. GDD §355 보석 5 / §431 보급 1세트(슬롯별 → 풀세트 개봉 보장). */
export const STARTER_GEMS = 5;
export const STARTER_BOXES_PER_SLOT = 2;

const SLOTS = ['weapon', 'armor', 'accessory'] as const;

/**
 * 인증 userId에 프로필 없으면 생성, 스타터 미수령(tutorial_step=0)이면 지급. **멱등**:
 * 지급은 `... WHERE tutorial_step = 0 RETURNING` 원자 조건 → 동시/재진입에도 정확히 1회.
 * 신규 유저: 프로필 생성(diamond 0) → 게이트 통과 → 보석+보급 지급·step=1.
 * 기존 미수령 유저: 프로필 유지 → 게이트 통과 → 동일 지급(소프트락 해소).
 * 이미 온보딩(step≠0): UPDATE 0행 → 무지급. (game) 레이아웃 진입마다 호출(첫 1회만 쓰기).
 */
export async function ensureUserBootstrap(userId: string): Promise<void> {
  await db.transaction(async (tx) => {
    // 1) 프로필 보장 (기존 행은 무변경; 신규는 diamond 0·tutorial_step 0).
    await tx
      .insert(profiles)
      .values({
        id: userId,
        nickname: `용사${userId.replace(/-/g, '').slice(0, 12)}`,
        diamond: BigInt(0),
      })
      .onConflictDoNothing({ target: profiles.id });

    // 2) 스타터 게이트 — tutorial_step=0 일 때만 보석 지급 + step=1 (원자·1회).
    const granted = await tx
      .update(profiles)
      .set({
        diamond: sql`${profiles.diamond} + ${BigInt(STARTER_GEMS)}`,
        tutorialStep: 1,
      })
      .where(sql`${profiles.id} = ${userId} and ${profiles.tutorialStep} = 0`)
      .returning({ id: profiles.id });

    if (granted.length === 0) return; // 이미 지급됨 — 보급도 재지급 금지

    // 3) 보급 스타터(슬롯별). 게이트 통과 1회만 도달하므로 단순 가산 upsert.
    await tx
      .insert(userSupplyBoxes)
      .values(SLOTS.map((slot) => ({ userId, slot, count: BigInt(STARTER_BOXES_PER_SLOT) })))
      .onConflictDoUpdate({
        target: [userSupplyBoxes.userId, userSupplyBoxes.slot],
        set: { count: sql`${userSupplyBoxes.count} + ${BigInt(STARTER_BOXES_PER_SLOT)}` },
      });
  });
}
