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

// 15초 인스턴스 캐시(2026-08-06) — 레이아웃(매 요청)과 actionBlock(매 변이 액션)이 각각
// profiles를 조회해 요청당 최대 2왕복이 나던 것을 공유 캐시 1왕복 이하로. 정지/해제 반영이
// ≤15s 늦는 건 기존 action-gate 캐시와 같은 수용 범위(레이아웃 차단도 동일 지연 허용).
const banCache = new Map<string, { at: number; s: BanState }>();
const BAN_TTL_MS = 15_000;

export async function getBanStateCached(userId: string): Promise<BanState> {
  const hit = banCache.get(userId);
  if (hit && Date.now() - hit.at < BAN_TTL_MS) return hit.s;
  const s = await getBanState(userId);
  if (banCache.size > 5000) banCache.clear();
  banCache.set(userId, { at: Date.now(), s });
  return s;
}
