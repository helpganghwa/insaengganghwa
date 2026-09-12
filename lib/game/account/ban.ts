import 'server-only';

import { eq, sql } from 'drizzle-orm';

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

/**
 * 전체 **알림(푸시)** 수신 자격 — SQL 조각. `profiles` 별칭을 받아 where 절에 끼운다.
 *
 * 정지된 유저는 게임에 들어올 수 없어 보상을 받을 수도, 공지를 볼 수도 없는데 푸시만 계속
 * 받는다 — 운영 메시지가 정지 사실과 모순되는 신호를 보내는 셈이다(2026-09-12 검수).
 *
 * ⚠ **우편에는 쓰지 않는다**(2026-09-12 사용자 확정). 푸시는 그때 못 받아도 잃는 게 없지만,
 * 전체 우편은 한 번 건너뛰면 **영영 못 받는다** — 7일 정지 중에 나간 보상 우편은 해제 뒤에도
 * 받을 수 없고(브로드캐스트는 적재가 곧 발송), 운영 화면에 누가 빠졌는지도 안 남아 소급
 * 발송을 따로 짜야 한다. 우편 만료가 30일이라 대개는 복귀 후 받을 수 있는 것이다.
 * 우편은 종전대로 `withdrawn_at is null`만 본다.
 *
 * 판정은 getBanState와 같다: 정지 시각이 있고, 해제 예정이 없거나 아직 오지 않음. 기간이 지난
 * 정지는 자동 해제로 보므로 수신 대상이다.
 */
export const SENDABLE_SQL = (alias: string) =>
  sql.raw(
    `${alias}.withdrawn_at is null and (${alias}.banned_at is null or (${alias}.ban_until is not null and ${alias}.ban_until <= now()))`,
  );
