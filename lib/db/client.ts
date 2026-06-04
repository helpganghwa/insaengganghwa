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
  // max 1→5 (2026-05-29): max:1은 단일 커넥션이 idle로 죽으면 모든 쿼리가 그 죽은 커넥션에
  // 막혀(데이터 누락이 주기적으로 반복) 단일 장애점이 됐음. 여러 커넥션이면 1개가 죽어도
  // 다른 커넥션으로 즉시 처리되고 동시 요청도 병렬. Supabase 트랜잭션 풀러(:6543)가 서버측
  // fan-out하므로 서버 커넥션 폭증 없음(클라 max만 늘어남).
  max: 5,
  // idle 20s: 90s는 죽은 커넥션을 오래 물고 있어 "못 부르는 구간"을 늘린 역효과였음 → 원복.
  idle_timeout: 20, // sec
  // 콜드 새 연결이 매달릴 때 8s 내 실패시켜 재연결 유도.
  connect_timeout: 8, // sec
  // max_lifetime 5min (2026-06-04): Supavisor 트랜잭션 풀러 경유 시 조용히 끊기거나
  // ClientRead 상태로 멈춘 커넥션이 풀에 오래 남으면 그 인스턴스의 후속 요청이 직렬 대기 →
  // "데이터 못 부르는 구간"이 생긴다(검증된 재발 모드 — 프로덕션서 279s orphaned 커넥션 관측).
  // 30min→5min로 단축해 멈춘 소켓을 빠르게 폐기·재생성. (서버측 statement_timeout/
  // idle_in_transaction을 client startup param으로 주는 방식은 풀러가 무시해 무효 — 검증함.
  // 실제 실행 중 쿼리는 role 기본 statement_timeout 2min로 별도 상한이 걸려 있음.)
  max_lifetime: 60 * 5, // sec
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
