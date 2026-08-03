import 'server-only';

import { sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';

import { TEST_ACCOUNTS } from './test-accounts';

/**
 * 세션 없는 경로(결제 웹훅·크론)에서 심사(cbt) 계정을 식별한다.
 *
 * `isReviewerAccount()`는 세션 JWT의 email 클레임을 읽으므로 웹훅에서는 쓸 수 없다.
 * 심사 계정 이메일은 `auth` 스키마(Supabase 관리, Drizzle 스키마 밖)에만 있어 raw SQL로 조회한다.
 * 목록이 상수라 프로세스 수명 동안 캐시한다 — 계정이 아직 없으면(빈 결과) 캐시하지 않는다.
 */
let cached: Set<string> | null = null;

export async function reviewerUserIds(): Promise<Set<string>> {
  if (cached) return cached;
  const emails = TEST_ACCOUNTS.map((a) => a.email.toLowerCase());
  const list = sql.join(
    emails.map((e) => sql`${e}`),
    sql`, `,
  );
  const rows = (await db.execute(
    sql`select id::text as id from auth.users where lower(email) in (${list})`,
  )) as unknown as { id: string }[];
  const ids = new Set(rows.map((r) => r.id));
  if (ids.size > 0) cached = ids;
  return ids;
}

export async function isReviewerUserId(userId: string): Promise<boolean> {
  try {
    return (await reviewerUserIds()).has(userId);
  } catch {
    // 조회 실패는 "심사 계정 아님"으로 — 실유저 보호 로직(미성년 한도)이 열리지 않게 fail-closed.
    return false;
  }
}
