import 'server-only';

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import * as schema from './schema';

/**
 * 서버 전용 DB 클라이언트.
 *
 * 성능 아키텍처 (CLAUDE §11.3) — 협상 불가:
 *  - `prepare: false`        : Supabase 트랜잭션 풀러(pgbouncer :6543) 정합
 *  - `max: 1`                : 서버리스 인스턴스당 1커넥션 (풀러가 팬아웃)
 *  - `idle_timeout`          : 유휴 커넥션 조기 회수
 *  - `connect_timeout`       : 콜드 커넥션 무한 대기 방지
 *  - 모듈 싱글톤              : 인스턴스 웜 재사용·dev HMR 커넥션 폭발 방지
 * 리전: Supabase 서울(ap-northeast-2) + Vercel icn1 코로케이션 (CLAUDE §11.2).
 * 마이그레이션만 DIRECT_URL(:5432). 런타임은 DATABASE_URL(풀러 :6543).
 */

type DrizzleDb = ReturnType<typeof drizzle<typeof schema>>;

declare global {
  // eslint-disable-next-line no-var
  var __pgClient: ReturnType<typeof postgres> | undefined;
}

const POSTGRES_OPTS = {
  prepare: false,
  max: 1,
  idle_timeout: 20, // sec
  connect_timeout: 10, // sec
} as const;

function buildClient(): ReturnType<typeof postgres> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL is required at runtime (see .env.example) — CLAUDE §7/§11');
  }
  // dev: HMR마다 새 커넥션 폭발 방지 → 전역 싱글톤.
  if (process.env.NODE_ENV === 'development') {
    globalThis.__pgClient ??= postgres(url, POSTGRES_OPTS);
    return globalThis.__pgClient;
  }
  return postgres(url, POSTGRES_OPTS);
}

let _db: DrizzleDb | undefined;

// Lazy — 빌드 시 DATABASE_URL 없어도 OK. 런타임 첫 사용 시 검증/연결.
export const db = new Proxy({} as DrizzleDb, {
  get(_t, prop, receiver) {
    _db ??= drizzle(buildClient(), { schema });
    return Reflect.get(_db, prop, receiver);
  },
});

export type Db = DrizzleDb;
