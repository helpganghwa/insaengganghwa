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

/** 즐겨찾기 상한 — 목록 최상단 ★ 섹션이 목록을 잡아먹지 않는 선(트랙 D 확정). */
const FAVORITE_CAP = 10;

/**
 * 칭호 즐겨찾기 토글(0169) — characters.favorite_titles(서버별) 배열에 추가/제거.
 * 발견한 칭호만 허용(미발견 즐겨찾기는 목록에 잠금 행을 상단 고정하게 됨).
 */
export async function toggleFavoriteTitleAction(
  code: string,
): Promise<{ ok: true; favorited: boolean } | { ok: false; error: string }> {
  const userId = await getSessionUserId();
  if (!userId) return { ok: false, error: 'UNAUTHENTICATED' };
  const serverId = await getActiveServerId();

  return db.transaction(async (tx) => {
    const rows = (await tx.execute(sql`
      select favorite_titles as favs,
             exists(select 1 from user_titles ut
                    where ut.user_id = ${userId}::uuid and ut.server_id = ${serverId}
                      and ut.title_code = ${code}) as discovered
      from characters where user_id = ${userId}::uuid and server_id = ${serverId}
      for update of characters
    `)) as unknown as { favs: string[]; discovered: boolean }[];
    const row = rows[0];
    if (!row) return { ok: false as const, error: 'NO_CHARACTER' };
    const favs = Array.isArray(row.favs) ? row.favs : [];
    const has = favs.includes(code);
    // 제거는 defs 존재와 무관하게 허용 — 칭호 회수 등으로 코드가 defs에서 사라져도 유령
    // 슬롯이 상한을 영구 잠식하지 않게(적대 검수 1). 추가만 실재+발견을 요구한다.
    if (!has) {
      if (!TITLE_BY_CODE.has(code)) return { ok: false as const, error: 'UNKNOWN_TITLE' };
      if (!row.discovered) return { ok: false as const, error: 'NOT_DISCOVERED' };
      if (favs.length >= FAVORITE_CAP) return { ok: false as const, error: 'FAVORITES_FULL' };
    }
    // 쓰는 김에 유령 코드 자가 정리 — 어떤 토글이든 한 번 지나가면 stale이 사라진다.
    // (추가되는 code는 위에서 실재 검증됨 — 이 필터가 삼키지 않는다.)
    const next = (has ? favs.filter((c) => c !== code) : [...favs, code]).filter((c) =>
      TITLE_BY_CODE.has(c),
    );
    await tx.execute(sql`
      update characters set favorite_titles = ${JSON.stringify(next)}::jsonb
      where user_id = ${userId}::uuid and server_id = ${serverId}
    `);
    return { ok: true as const, favorited: !has };
  });
}
