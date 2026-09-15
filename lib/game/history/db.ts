import 'server-only';

import { makeDb, runWithDb } from '@/lib/db/client';

/**
 * 역사 페이지 전용 DB 스코프(2026-09-16). `HISTORY_DATABASE_URL`이 있으면(스테이징 Preview에만 등록 —
 * 프로덕션 읽기 전용 역할 history_reader) 그 연결로, 없으면(프로덕션) 기본 DB로 fn을 실행한다.
 * 역사 모듈의 읽기 경로만 이 스코프를 쓴다 — 다른 화면은 영향 없음.
 */
let _alt: ReturnType<typeof makeDb> | undefined;
export function withHistoryDb<T>(fn: () => Promise<T>): Promise<T> {
  const url = process.env.HISTORY_DATABASE_URL;
  if (!url) return fn();
  _alt ??= makeDb(url, 3);
  return runWithDb(_alt, fn);
}
