import 'server-only';

import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

/**
 * 게임 변이 액션 어뷰징 방어 — Upstash Redis 슬라이딩 윈도우 (CLAUDE §1).
 *
 * **Fail-open**: Upstash env 미설정 / Redis 장애 시 차단하지 않고 통과(가용성
 * 우선 — 결과·자원 무결성은 서버 RNG·원자 트랜잭션·멱등이 이미 보장; 레이트리밋은
 * 봇 플러드 감속용 추가 방어선). 활성화하려면 Vercel/`.env.local`에
 * `UPSTASH_REDIS_REST_URL`·`UPSTASH_REDIS_REST_TOKEN` 주입(.env.example 참조).
 *
 * 식별자 = userId(계정 단위). 윈도우는 정상 빠른 플레이는 통과, 봇 연타만 차단.
 */
export type RlBucket = 'enhance' | 'gacha' | 'inventory' | 'raid' | 'nickname';

const WINDOWS: Record<RlBucket, [limit: number, window: `${number} s`]> = {
  enhance: [30, '10 s'],
  gacha: [15, '10 s'],
  inventory: [40, '10 s'],
  raid: [30, '10 s'],
  nickname: [5, '60 s'],
};

const url = process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN;

const redis = url && token ? new Redis({ url, token }) : null;

const limiters: Partial<Record<RlBucket, Ratelimit>> = {};
function limiter(bucket: RlBucket): Ratelimit | null {
  if (!redis) return null;
  if (!limiters[bucket]) {
    const [limit, window] = WINDOWS[bucket];
    limiters[bucket] = new Ratelimit({
      redis,
      prefix: `rl:${bucket}`,
      limiter: Ratelimit.slidingWindow(limit, window),
      analytics: false,
    });
  }
  return limiters[bucket]!;
}

let warned = false;

/** true = 차단(한도 초과). env 미설정·장애 시 false(fail-open). */
export async function rateLimited(userId: string, bucket: RlBucket): Promise<boolean> {
  const rl = limiter(bucket);
  if (!rl) {
    if (!warned) {
      warned = true;
      console.warn('[ratelimit] Upstash env 미설정 — fail-open(비활성). .env 주입 필요');
    }
    return false;
  }
  try {
    const { success } = await rl.limit(userId);
    return !success;
  } catch (e) {
    console.warn('[ratelimit] fail-open (Redis 오류)', e);
    return false;
  }
}
