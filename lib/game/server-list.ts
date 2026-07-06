import 'server-only';

import { inArray } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { servers } from '@/lib/db/schema/server';

/**
 * 운영 중인 서버 id 목록 — 크론 서버 루프용(SERVER.md §3).
 * full은 신규 캐릭터 생성만 막는 상태라 크론(리더보드/대난투/점령전 등)은 계속 돌아야 한다.
 * closed만 제외.
 */
export async function openServerIds(): Promise<number[]> {
  const rows = await db
    .select({ id: servers.id })
    .from(servers)
    .where(inArray(servers.status, ['open', 'full']))
    .orderBy(servers.id);
  const ids = rows.map((r) => r.id);
  return ids.length > 0 ? ids : [1];
}
