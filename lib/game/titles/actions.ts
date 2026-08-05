'use server';

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

  if (code !== null) {
    if (!TITLE_BY_CODE.has(code)) return { ok: false, error: 'UNKNOWN_TITLE' };
    const serverId = await getActiveServerId();
    const eligible = await representativeEligible(userId, serverId, code);
    if (!eligible) return { ok: false, error: 'NOT_ELIGIBLE' };
  }

  await db.execute(sql`
    update profiles set representative_title_code = ${code} where id = ${userId}::uuid
  `);
  return { ok: true };
}
