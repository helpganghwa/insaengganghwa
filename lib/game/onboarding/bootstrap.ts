// 신규 유저 부트스트랩 — 최초 로그인 시 프로필 생성 + 스타터 지급 (정확히 1회, 단일 트랜잭션).
//
// 배경: 프로필 생성 로직이 전무했고(콜백=세션교환만, DB 트리거 없음) 스타터 지급도 없어
// 신규 유저가 보급 0 → 진행 불가(소프트락). GDD §347/§431/§3.5 온보딩의 *최소 슬라이스*만 구현:
// 프로필+자동 닉네임 + 보급/보석 스타터. 전체 Day-1 튜토리얼(닉네임 설정 화면·강화/단축/초월
// 체험·자랑 유도)과 tutorial_step 진행은 후속(태스크 #18). 닉네임은 자동 생성 — 사용자가
// 설정(/me/settings)에서 변경 가능.

import { db } from '@/lib/db/client';
import { profiles } from '@/lib/db/schema/profiles';
import { userSupplyBoxes } from '@/lib/db/schema/supply';

/** 스타터 지급량 — 튜닝 가능. GDD §355 보석 5 / §431 보급 1세트(슬롯별 지급 → 풀세트 개봉 보장). */
export const STARTER_GEMS = 5;
export const STARTER_BOXES_PER_SLOT = 2;

const SLOTS = ['weapon', 'armor', 'accessory'] as const;

/**
 * 인증된 userId에 프로필이 없으면 생성 + 스타터 지급. **멱등**:
 * profiles는 onConflictDoNothing(PK=id) — 신규 생성된 경우(returning 존재)에만 스타터 지급해
 * 재지급을 원천 차단. (game) 레이아웃 진입마다 호출되지만 첫 1회만 실제 쓰기(이후 no-op 1왕복).
 */
export async function ensureUserBootstrap(userId: string): Promise<void> {
  await db.transaction(async (tx) => {
    const inserted = await tx
      .insert(profiles)
      .values({
        id: userId,
        nickname: `용사${userId.replace(/-/g, '').slice(0, 12)}`,
        diamond: BigInt(STARTER_GEMS),
      })
      .onConflictDoNothing({ target: profiles.id })
      .returning({ id: profiles.id });

    if (inserted.length === 0) return; // 이미 부트스트랩됨 — 재지급 금지

    await tx
      .insert(userSupplyBoxes)
      .values(SLOTS.map((slot) => ({ userId, slot, count: BigInt(STARTER_BOXES_PER_SLOT) })));
  });
}
