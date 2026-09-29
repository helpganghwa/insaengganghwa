import 'server-only';

import { sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';

/**
 * 조건이 강화된 영구형 칭호 — 옛 기준으로 얻은 보유자는 title_legacy_locks(0223)에 잠겨, 새 조건을 한 번
 * 채우기 전까지 발견만 된 채 비활성(목록 '비활성', 대표 장착 불가, 대표여도 표시 안 함).
 * 오관왕 → 육관왕(랭킹 6종, 2026-09-29).
 */
export const LEGACY_LOCKABLE: ReadonlySet<string> = new Set(['pentagon']);

/** 잠긴 칭호 코드 — 표 미적용(프로덕션 반영 전)이면 빈 집합(잠금 없음). */
export async function legacyLockedTitles(userId: string, serverId: number): Promise<Set<string>> {
  try {
    const rows = (await db.execute(sql`
      select title_code from title_legacy_locks where user_id=${userId}::uuid and server_id=${serverId}
    `)) as unknown as { title_code: string }[];
    return new Set(rows.map((r) => r.title_code));
  } catch {
    return new Set();
  }
}
