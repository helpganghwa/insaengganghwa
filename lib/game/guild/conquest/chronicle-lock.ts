import 'server-only';

import { Redis } from '@upstash/redis';

/**
 * 연대기 생성 잠금(2026-09-24) — 23시대 conquest-run은 5분마다 돌고 생성 한 번이 LLM 1~3회(최대 수 분)라,
 * 앞 틱이 아직 생성 중일 때 다음 틱이 같은 (서버, 날짜)를 또 생성했다. 저장은 onConflictDoNothing이라 먼저 끝난
 * 쪽만 남고 나머지 LLM 호출은 버려졌다(비용·함수 시간 낭비).
 *
 * Redis SET NX EX로 잡는다. DB advisory lock은 트랜잭션 풀러(:6543)에서 세션을 보장하지 못하고, 생성 내내
 * 트랜잭션을 열어 둘 수도 없어서 쓰지 않는다. Redis가 없거나 장애면 잠금 없이 진행한다(fail-open) — 최악이
 * 종전과 같은 중복 생성일 뿐이고, 생성 자체를 막으면 연대기가 빠진다.
 */
const url = process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN;
const redis = url && token ? new Redis({ url, token }) : null;

/** 생성 한 번의 상한(생성 루프 마감 225초) + 여유. 함수가 죽어도 이 시간 뒤 자동 해제. */
const LOCK_TTL_SEC = 290;

/** 잠금을 잡으면 해제 함수를, 이미 다른 실행이 잡고 있으면 null을 돌려준다. */
export async function acquireChronicleLock(serverId: number, kstDay: string): Promise<(() => Promise<void>) | null> {
  if (!redis) return async () => {};
  // 스테이징(preview)과 프로덕션이 같은 Redis를 쓴다 — 환경을 키에 넣지 않으면 스테이징 재생성이 프로덕션 사전 생성을 막는다.
  const key = `chronicle:gen:${process.env.VERCEL_ENV ?? 'local'}:${serverId}:${kstDay}`;
  const owner = crypto.randomUUID();
  try {
    const ok = await redis.set(key, owner, { nx: true, ex: LOCK_TTL_SEC });
    if (ok !== 'OK') return null;
  } catch (e) {
    console.warn('[chronicle-lock] Redis 오류 — 잠금 없이 진행', (e as Error).message);
    return async () => {};
  }
  return async () => {
    try {
      // 내가 잡은 잠금일 때만 푼다(TTL로 풀린 뒤 다른 실행이 잡은 잠금을 지우지 않게).
      if ((await redis.get<string>(key)) === owner) await redis.del(key);
    } catch {
      // TTL이 푼다.
    }
  };
}
