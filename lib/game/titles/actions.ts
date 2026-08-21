'use server';

import { revalidatePath } from 'next/cache';

import { sql } from 'drizzle-orm';

import { getSessionUserId } from '@/lib/auth/session';
import { db } from '@/lib/db/client';
import { getActiveServerId } from '@/lib/game/servers';

import { TITLE_BY_CODE } from './defs';
import { representativeEligible } from './judge';

/**
 * 대표 칭호 장착/해제 — code=null이면 미장착.
 * 자격(발견 + 조건부는 현재 활성)은 서버에서 재검증한다 — 클라 값 신뢰 금지(CLAUDE §3).
 */
export async function setRepresentativeTitleAction(
  code: string | null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const userId = await getSessionUserId();
  if (!userId) return { ok: false, error: 'UNAUTHENTICATED' };

  const serverId = await getActiveServerId();
  if (code !== null) {
    if (!TITLE_BY_CODE.has(code)) return { ok: false, error: 'UNKNOWN_TITLE' };
    const eligible = await representativeEligible(userId, serverId, code);
    if (!eligible) return { ok: false, error: 'NOT_ELIGIBLE' };
  }

  // 서버별 저장(2026-08-07 칭호 서버별화) — 이전엔 profiles 전역 컬럼이라 서버1 칭호가
  // 서버2 캐릭터에 표시됐다. 자격 검증(representativeEligible)도 같은 서버 원장 기준.
  const updated = (await db.execute(sql`
    update characters set representative_title_code = ${code}
    where user_id = ${userId}::uuid and server_id = ${serverId}
    returning user_id
  `)) as unknown as unknown[];
  // 0행 = 이 서버에 캐릭터 없음 — ok로 답하면 클라 낙관 반영이 영구히 남는다(감사 3-c).
  if (updated.length === 0) return { ok: false, error: 'NO_CHARACTER' };
  // 헤더(layout)·/me·유저 페이지 등 표시 지점 즉시 반영 — 저빈도 액션이라 layout 전체
  // 재검증 비용(§11.7) 허용. 없으면 다음 내비게이션까지 이전 칭호가 남는다(2026-08-05).
  revalidatePath('/', 'layout');
  return { ok: true };
}
