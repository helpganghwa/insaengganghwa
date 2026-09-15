import { and, eq, sql } from 'drizzle-orm';

import type { db } from '@/lib/db/client';
import { userProfiles } from '@/lib/db/schema/avatar';
import { PROFILE_MAX } from '@/lib/game/balance';

/** db 또는 트랜잭션 — 소유 조회와 갱신 2문만 쓴다. */
type Dbx = Pick<typeof db, 'select' | 'execute'>;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * 아바타 관리 화면 순서 저장(0200). 받은 id 순서대로 1..N을 매기고, 그 서버의 나머지(화면이 모르던 —
 * 다른 탭에서 방금 생성된) 아바타는 0으로 되돌려 맨 앞에 둔다(새 아바타 규칙과 동일).
 *
 * 검증: 형식·중복·개수(PROFILE_MAX). 하나라도 본인·활성 서버 소유가 아니면 아무것도 바꾸지 않고 'NOT_OWNED'.
 * 순서만 바꾸는 갱신이라 잠금은 두지 않는다 — 동시 저장은 마지막 것이 이긴다(같은 사람의 두 탭).
 */
export async function reorderUserProfiles(
  tx: Dbx,
  userId: string,
  serverId: number,
  ids: readonly string[],
): Promise<'ok' | 'INVALID' | 'NOT_OWNED'> {
  if (ids.length === 0 || ids.length > PROFILE_MAX) return 'INVALID';
  if (new Set(ids).size !== ids.length || ids.some((x) => !UUID_RE.test(x))) return 'INVALID';

  const list = [...ids];
  // drizzle sql 템플릿은 JS 배열을 ($1, $2, …) 목록으로 펼친다 — uuid[]로 넘기려면 배열 리터럴 문자열로.
  const arr = `{${list.join(',')}}`;
  const owned = await tx
    .select({ id: userProfiles.id })
    .from(userProfiles)
    .where(and(eq(userProfiles.userId, userId), eq(userProfiles.serverId, serverId)));
  const ownedSet = new Set(owned.map((r) => r.id));
  if (list.some((id) => !ownedSet.has(id))) return 'NOT_OWNED';

  await tx.execute(sql`
    update user_profiles p
       set sort_order = v.ord
      from unnest(${arr}::uuid[]) with ordinality as v(id, ord)
     where p.id = v.id and p.user_id = ${userId}::uuid and p.server_id = ${serverId}
  `);
  if (owned.length > list.length) {
    await tx.execute(sql`
      update user_profiles
         set sort_order = 0
       where user_id = ${userId}::uuid and server_id = ${serverId} and id <> all(${arr}::uuid[])
    `);
  }
  return 'ok';
}
