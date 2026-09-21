'use server';

import { revalidatePath } from 'next/cache';
import { eq, sql } from 'drizzle-orm';

import { requireAdmin } from '@/lib/auth/require-admin';
import { db } from '@/lib/db/client';
import { adminActions } from '@/lib/db/schema/ops';
import { servers } from '@/lib/db/schema/server';

/** servers.status 허용 값 — SERVER.md §6. */
const STATUSES = ['open', 'full', 'closed'] as const;
export type ServerStatus = (typeof STATUSES)[number];

export type ServerRow = {
  id: number;
  name: string;
  status: ServerStatus;
  characters: number;
  /** 최근 7일 접속자 — 포화 판단 재료. */
  active7: number;
};

export async function listServerRows(): Promise<ServerRow[]> {
  await requireAdmin();
  return (await db.execute(sql`
    select s.id::int as id, s.name, s.status::text as status,
           count(c.user_id)::int as characters,
           count(c.user_id) filter (where c.last_seen_at >= now() - interval '7 days')::int as active7
      from servers s
      left join characters c on c.server_id = s.id
     group by s.id, s.name, s.status
     order by s.id
  `)) as unknown as ServerRow[];
}

/**
 * 서버 상태 전환(2026-09-21 ⑮) — 종전에는 `servers`에 쓰는 코드가 오픈 스크립트의 INSERT
 * 하나뿐이라, 포화(full) 전환·사고 시 긴급 차단(closed)을 전부 수동 SQL로 해야 했다.
 * `openServerIds()`(open+full)가 크론의 유일한 서버 원천이라 이 값을 급히 바꿀 수단이 없다는 건
 * 장애 대응 수단이 없다는 뜻이다.
 *
 * - open   = 정상(신규 캐릭터 생성 가능)
 * - full   = 신규 캐릭터 생성만 제한. 기존 캐릭터는 정상, 크론도 계속 돈다(SERVER.md §6)
 * - closed = 준비 중/통합 대비. 크론 순회에서도 빠진다 — **접속 중인 유저가 있으면 막는다**
 */
export async function setServerStatusAction(
  serverId: number,
  status: string,
): Promise<{ status: 'success' } | { status: 'error'; code: string; message: string }> {
  const adminId = await requireAdmin();
  if (!Number.isInteger(serverId) || serverId < 1) {
    return { status: 'error', code: 'BAD_SERVER', message: '서버 번호가 올바르지 않습니다.' };
  }
  if (!STATUSES.includes(status as ServerStatus)) {
    return { status: 'error', code: 'BAD_STATUS', message: '상태 값이 올바르지 않습니다.' };
  }

  const [cur] = await db
    .select({ id: servers.id, name: servers.name, status: servers.status })
    .from(servers)
    .where(eq(servers.id, serverId))
    .limit(1);
  if (!cur) return { status: 'error', code: 'NOT_FOUND', message: '없는 서버입니다.' };
  if (cur.status === status) return { status: 'success' };

  // closed는 크론 순회에서 빠져 점령전·대난투·정산이 멈춘다 — 사람이 남아 있으면 실수로 본다.
  if (status === 'closed') {
    const rows = (await db.execute(sql`
      select count(*)::int as n from characters
       where server_id = ${serverId} and last_seen_at >= now() - interval '7 days'
    `)) as unknown as { n: number }[];
    const n = rows[0]?.n ?? 0;
    if (n > 0) {
      return {
        status: 'error',
        code: 'HAS_ACTIVE',
        message: `최근 7일 접속자가 ${n}명 있습니다. 먼저 '포화'로 두고 공지한 뒤 닫아 주세요.`,
      };
    }
  }

  await db.transaction(async (tx) => {
    await tx.update(servers).set({ status }).where(eq(servers.id, serverId));
    await tx.insert(adminActions).values({
      adminUserId: adminId,
      action: 'server.set_status',
      targetType: 'server',
      targetId: String(serverId),
      payload: { name: cur.name, before: cur.status, after: status },
    });
  });
  revalidatePath('/admin/servers');
  return { status: 'success' };
}
