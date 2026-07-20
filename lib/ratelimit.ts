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
export type RlBucket =
  | 'enhance'
  | 'enhanceCancel'
  | 'gacha'
  | 'inventory'
  | 'raid'
  | 'nickname'
  | 'mail'
  | 'checkin'
  | 'challenge'
  | 'battlepass'
  | 'friend'
  | 'guild'
  | 'shop'
  | 'profile'
  | 'profileEdit'
  | 'report'
  | 'support'
  | 'identity'
  | 'clientError'
  | 'chatSend'
  | 'chatBurst';

const WINDOWS: Record<RlBucket, [limit: number, window: `${number} s`]> = {
  enhance: [30, '10 s'],
  // 취소 전용 — 슬롯 전멸 사건(2026-07-06) 재발 가드(버그성 취소 루프 감속).
  // [8,'60s']는 슬라이딩 60초에 직전 취소 이력이 남아 6슬롯 연속 취소가 4~5번째에서
  // 막혔음(2026-07-13 CBT 피드백). 정상 상한 = 6슬롯 취소→재등록→재취소 회전까지
  // 여유 있게 30초 15회 — 루프 버그는 여전히 감속(분당 30 vs 정상 최대 ~12).
  enhanceCancel: [15, '30 s'],
  gacha: [15, '10 s'],
  inventory: [40, '10 s'],
  raid: [30, '10 s'],
  nickname: [5, '60 s'],
  mail: [60, '10 s'],
  checkin: [10, '10 s'],
  // 도전 과제 수령 — 일회성 31건 유계라 느슨하게(연속 연타 = 정상 사용, 2026-07-15 CBT).
  challenge: [40, '10 s'],
  battlepass: [20, '10 s'],
  friend: [20, '10 s'], // 검색·요청·수락 스팸 방어
  guild: [20, '10 s'], // 기부·배치·가입·문양생성 자동화 방어
  shop: [20, '10 s'], // 무료수령·주문·상자구매 연타 방어
  profile: [10, '3600 s'], // 아바타 생성(Claude+Pixellab 고비용) — 시간당 10건
  profileEdit: [30, '10 s'], // 대표 선택·방향 변경·삭제 연타 방어(저비용)
  report: [5, '60 s'], // 신고 스팸·reportCount 인플레이션 방어
  support: [5, '3600 s'], // 고객센터 문의 — 시간당 5건(스팸 방어)
  identity: [10, '600 s'], // 본인인증 검증 — 임의 ID 대량 전달로 포트원 조회 폭주 방어
  clientError: [30, '60 s'], // 무인증 공개 에러 수집 — IP당 분당 30(에러 버스트 허용+남용 방어)
  chatSend: [1, '5 s'], // 월드 채팅 쿨다운(0125) — 5초당 1회
  chatBurst: [12, '60 s'], // 월드 채팅 분당 상한 — 도배 방어
};

/**
 * Redis(분산) 유지 버킷 — 고비용 생성·어뷰징 민감·저빈도라 정확한 계정 단위 상한이 필요한 곳.
 * 나머지 고빈도 게임 버킷은 인스턴스 인메모리 창으로 처리(2026-07-21): Upstash 무료 50만
 * 커맨드/월을 게임 연타가 소진해 전체 fail-open되던 문제 해소(커맨드 ~95% 절감).
 * 인메모리는 인스턴스별 독립 창이라 상한이 인스턴스 수만큼 완화되지만, 목적이 봇 플러드
 * '감속'(무결성은 트랜잭션·멱등이 보장)이라 충분 — Fluid 인스턴스 재사용으로 실효성 있음.
 */
const REDIS_BUCKETS: ReadonlySet<RlBucket> = new Set<RlBucket>([
  'profile', // Claude+Pixellab 고비용 생성
  'identity', // 포트원 조회 폭주 방어
  'support',
  'report',
  'nickname',
  'chatSend', // 전서버 공개 채팅 — 정확한 쿨다운 필요
  'chatBurst',
  'clientError', // 무인증 공개 엔드포인트
]);

/** 인메모리 슬라이딩 창 — key=`${bucket}:${userId}`, 값=요청 시각 목록(창 밖 자동 배출). */
const memHits = new Map<string, number[]>();
function memLimited(userId: string, bucket: RlBucket): boolean {
  const [limit, window] = WINDOWS[bucket];
  const winMs = Number.parseInt(window, 10) * 1000;
  const now = Date.now();
  const key = `${bucket}:${userId}`;
  const kept = (memHits.get(key) ?? []).filter((t) => now - t < winMs);
  if (kept.length >= limit) {
    memHits.set(key, kept);
    return true;
  }
  kept.push(now);
  memHits.set(key, kept);
  // 메모리 상한 가드 — 5만 키 초과 시 만료 엔트리 일괄 청소(드묾, 최대 창 3600s 기준).
  if (memHits.size > 50_000) {
    for (const [k, v] of memHits) {
      const f = v.filter((t) => now - t < 3_600_000);
      if (f.length === 0) memHits.delete(k);
      else memHits.set(k, f);
    }
  }
  return false;
}

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
  // 고빈도 게임 버킷 — 인메모리 창(Upstash 커맨드 미소비, 네트워크 왕복 0).
  if (!REDIS_BUCKETS.has(bucket)) return memLimited(userId, bucket);
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
