import 'server-only';

import { eq } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { servers } from '@/lib/db/schema/server';

/** 열려 있는 서버 id 목록 — 크론 서버 루프용(SERVER.md §3). full도 기존 캐릭터는 정상 운영. */
export async function openServerIds(): Promise<number[]> {
  const rows = await db
    .select({ id: servers.id })
    .from(servers)
    .where(eq(servers.status, 'open'))
    .orderBy(servers.id);
  const ids = rows.map((r) => r.id);
  return ids.length > 0 ? ids : [1];
}
