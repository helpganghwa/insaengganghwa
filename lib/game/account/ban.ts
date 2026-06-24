import 'server-only';

import { eq } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { profiles } from '@/lib/db/schema/profiles';

/**
 * 계정 정지 상태 — (game) 레이아웃 게이트가 매 요청 확인. banned면 게임 대신 정지화면.
 * ban_until 지나면 자동 해제 간주(만료). 조회 실패는 호출부에서 fail-open 처리.
 */
export type BanState = { banned: boolean; reason: string | null; until: Date | null };

export async function getBanState(userId: string): Promise<BanState> {
  const [p] = await db
    .select({ bannedAt: profiles.bannedAt, banReason: profiles.banReason, banUntil: profiles.banUntil })
    .from(profiles)
    .where(eq(profiles.id, userId))
    .limit(1);
  if (!p?.bannedAt) return { banned: false, reason: null, until: null };
  if (p.banUntil && Date.now() >= p.banUntil.getTime()) {
    return { banned: false, reason: null, until: null }; // 기간 만료 — 자동 해제
  }
  return { banned: true, reason: p.banReason, until: p.banUntil };
}
