import 'server-only';

import { db } from '@/lib/db/client';
import { servers } from '@/lib/db/schema/server';

/**
 * 운영 중인 서버 id 목록 — 크론 서버 루프용(SERVER.md §3).
 * full은 신규 캐릭터 생성만 막는 상태라 크론(리더보드/대난투/점령전 등)은 계속 돌아야 한다.
 * closed만 제외.
 */
export async function openServerIds(): Promise<number[]> {
  const rows = await db.select({ id: servers.id, status: servers.status }).from(servers).orderBy(servers.id);
  // 서버 표가 비어 있을 때(초기 로컬 DB)만 1번으로 본다. 행이 있는데 전부 닫혔으면 빈 목록 — 닫힌 서버에서 크론이
  // 돌면 동결된 자산에 보상·우편이 쌓인다(11-16 검수 B9).
  if (rows.length === 0) return [1];
  return rows.filter((r) => r.status === 'open' || r.status === 'full').map((r) => r.id);
}
