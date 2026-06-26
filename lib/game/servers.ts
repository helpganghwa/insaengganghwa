import 'server-only';

import { cookies } from 'next/headers';
import { asc } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { servers } from '@/lib/db/schema/server';

/** 기본 서버 — 다중 서버 오픈 전까지 모든 컨텍스트가 이 값(SERVER.md §3). */
export const DEFAULT_SERVER_ID = 1;

/**
 * 전체 서버 목록(id 오름차순) — 관리자 서버 필터/표시용. 준불변이라 요청 경로 캐시.
 * 운영 페이지는 활성 서버 쿠키와 무관하게 전 서버를 한 화면에서 보고 `?srv=`로 좁힌다.
 */
export async function listServers(): Promise<{ id: number; name: string; status: string }[]> {
  return db
    .select({ id: servers.id, name: servers.name, status: servers.status })
    .from(servers)
    .orderBy(asc(servers.id));
}

/**
 * 활성 서버 — `srv` 쿠키(서버 선택 화면에서 설정). 미설정/비정상이면 기본 서버.
 * 존재·open 검증은 서버 선택 시점에 1회(요청마다 DB 왕복 없음 — 폐쇄 서버 쿠키는 선택 화면이 교정).
 * 크론·배치는 쿠키 없이 serverId를 명시 인자로 받는다(요청 컨텍스트 밖 → 기본값 반환).
 */
export async function getActiveServerId(): Promise<number> {
  try {
    const v = (await cookies()).get('srv')?.value;
    const n = v ? Number(v) : NaN;
    return Number.isInteger(n) && n >= 1 && n <= 32767 ? n : DEFAULT_SERVER_ID;
  } catch {
    return DEFAULT_SERVER_ID; // 요청 컨텍스트 밖(크론 등)
  }
}
