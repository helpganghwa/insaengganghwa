// 신규/미온보딩 유저 부트스트랩 — 프로필 보장 + 스타터 1회 지급. **인터랙티브 트랜잭션 미사용.**
//
// 배경: 프로필 생성 로직 전무 + 스타터 미지급 → 신규/기존 유저 보급 0 = 진행 불가(소프트락).
// 게이트는 'tutorial_step==0'(GDD §4) — 신규+기존-미수령 모두 첫 진입 1회 지급.
//
// ⚠ 설계 주의: 이 함수는 (game) 레이아웃 = *모든 인증 요청 렌더 경로*에서 호출된다.
// 트랜잭션 풀러(:6543 pgbouncer)+max:1 풀에서 인터랙티브 db.transaction(BEGIN/COMMIT)을
// 매 요청 잡으면 단일 커넥션 점유로 hang(무한로딩) → 트랜잭션 없이 **멱등 단일 문장 3개**로 구성.
// 원자성 핵심: 지급 게이트는 `UPDATE … WHERE tutorial_step=0 RETURNING` 단일 원자 문장 —
// 동시/재진입에도 정확히 1회. (gem 지급 후 supply insert 직전 프로세스 사망 시 보석만 지급되는
// 희박 엣지는 허용; 무한로딩 outage보다 안전. 호출부는 추가로 try/catch fail-safe.)

import { sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { profiles } from '@/lib/db/schema/profiles';
import { userSupplyBoxes } from '@/lib/db/schema/supply';

/** 스타터 지급량 — 튜닝 가능. GDD §355 보석 5 / §431 보급 1세트(슬롯별 → 풀세트 개봉 보장). */
export const STARTER_GEMS = 5;
export const STARTER_BOXES_PER_SLOT = 2;

const SLOTS = ['weapon', 'armor', 'accessory'] as const;

/**
 * 프로필 없으면 생성 → 스타터 미수령(tutorial_step=0)이면 지급. 트랜잭션 없이 멱등 3문장.
 * 평상시(이미 온보딩): 1) ON CONFLICT DO NOTHING(무변경) 2) UPDATE 0행 → 조기 반환.
 * 즉 정상 유저는 가벼운 2쿼리(둘 다 PK 인덱스), 행/락 없음.
 */
export async function ensureUserBootstrap(userId: string): Promise<void> {
  // 1) 프로필 보장 (기존 행 무변경; 신규는 diamond 0·tutorial_step 0).
  await db
    .insert(profiles)
    .values({
      id: userId,
      nickname: `용사${userId.replace(/-/g, '').slice(0, 12)}`,
      diamond: BigInt(0),
    })
    .onConflictDoNothing({ target: profiles.id });

  // 2) 스타터 게이트 — tutorial_step=0 일 때만 보석 지급 + step=1 (단일 원자 문장, 1회).
  const granted = await db
    .update(profiles)
    .set({
      diamond: sql`${profiles.diamond} + ${BigInt(STARTER_GEMS)}`,
      tutorialStep: 1,
    })
    .where(sql`${profiles.id} = ${userId} and ${profiles.tutorialStep} = 0`)
    .returning({ id: profiles.id });

  if (granted.length === 0) return; // 이미 지급됨 — 보급도 재지급 금지

  // 3) 보급 스타터(슬롯별). 게이트 통과 1회만 도달하므로 가산 upsert.
  await db
    .insert(userSupplyBoxes)
    .values(SLOTS.map((slot) => ({ userId, slot, count: BigInt(STARTER_BOXES_PER_SLOT) })))
    .onConflictDoUpdate({
      target: [userSupplyBoxes.userId, userSupplyBoxes.slot],
      set: { count: sql`${userSupplyBoxes.count} + ${BigInt(STARTER_BOXES_PER_SLOT)}` },
    });
}
