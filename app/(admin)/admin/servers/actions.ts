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
  /** 운영자가 추천으로 지정했는가(0210). */
  recommended: boolean;
  /** 지금 신규가 실제로 배정되는 서버인가 — 지정이 없으면 최신 open 서버가 대신 맡는다. */
  effective: boolean;
};

export async function listServerRows(): Promise<ServerRow[]> {
  await requireAdmin();
  return (await db.execute(sql`
    select s.id::int as id, s.name, s.status::text as status, s.recommended,
           s.id = coalesce(
             (select id from servers where recommended and status = 'open' limit 1),
             (select max(id) from servers where status = 'open')
           ) as effective,
           count(c.user_id)::int as characters,
           count(c.user_id) filter (where c.last_seen_at >= now() - interval '7 days')::int as active7
      from servers s
      left join characters c on c.server_id = s.id
     group by s.id, s.name, s.status, s.recommended
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
    // 추천 서버는 open일 때만 뜻이 있다 — open을 벗어나면 지정을 함께 푼다(신규는 최신 open 서버로).
    await tx
      .update(servers)
      .set(status === 'open' ? { status } : { status, recommended: false })
      .where(eq(servers.id, serverId));
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

/**
 * 추천 서버 지정(0210, 2서버 남은 결정 D1) — 신규 유저의 기본 서버. 한 곳만, open 서버만.
 * 서버를 여는 날과 신규를 받기 시작하는 날을 따로 정할 수 있게 한다(종전엔 무조건 최신 서버).
 * 초대 링크로 온 신규는 이 값과 무관하게 초대한 사람의 서버로 간다.
 */
export async function setRecommendedServerAction(
  serverId: number,
): Promise<{ status: 'success' } | { status: 'error'; code: string; message: string }> {
  const adminId = await requireAdmin();
  const [cur] = await db
    .select({ id: servers.id, name: servers.name, status: servers.status, recommended: servers.recommended })
    .from(servers)
    .where(eq(servers.id, serverId))
    .limit(1);
  if (!cur) return { status: 'error', code: 'NOT_FOUND', message: '없는 서버입니다.' };
  if (cur.status !== 'open') {
    return { status: 'error', code: 'NOT_OPEN', message: "'정상' 상태인 서버만 추천으로 지정할 수 있습니다." };
  }
  if (cur.recommended) return { status: 'success' };

  await db.transaction(async (tx) => {
    // 부분 유니크(servers_one_recommended_uq)가 한 곳만 허용 — 먼저 내리고 올린다.
    const prev = await tx
      .update(servers)
      .set({ recommended: false })
      .where(eq(servers.recommended, true))
      .returning({ id: servers.id });
    await tx.update(servers).set({ recommended: true }).where(eq(servers.id, serverId));
    await tx.insert(adminActions).values({
      adminUserId: adminId,
      action: 'server.set_recommended',
      targetType: 'server',
      targetId: String(serverId),
      payload: { name: cur.name, before: prev[0]?.id ?? null, after: serverId },
    });
  });
  revalidatePath('/admin/servers');
  return { status: 'success' };
}
