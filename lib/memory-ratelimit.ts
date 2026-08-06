import 'server-only';

/**
 * 인메모리 고정창 레이트리밋(2026-08-06) — 조회성 핫패스 전용.
 *
 * 왜 Upstash가 아닌가: 채팅 폴링은 동접 1천 기준 초당 수십 요청이라, Redis 왕복을 붙이면
 * 그 자체가 커맨드 쿼터(CBT에서 무료 50만 실도달)와 지연을 만든다. 조회 리밋의 목적은
 * 봇/폭주 방어지 정밀 과금이 아니므로, 인스턴스 로컬 고정창이면 충분하다.
 * 한계: 인스턴스별 독립 창(Fluid 인스턴스 수만큼 상한이 곱해질 수 있음) — 목적상 허용.
 */
const windows = new Map<string, { at: number; n: number }>();
let lastSweep = 0;

/** true = 초과(거부해야 함). key는 `버킷:유저` 형태 권장. */
export function memoryRateLimited(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  // 주기적 청소 — 만료 창 제거(폴링 키가 유저 수만큼 쌓이는 것 방지).
  if (now - lastSweep > 60_000) {
    lastSweep = now;
    for (const [k, w] of windows) if (now - w.at > windowMs * 2) windows.delete(k);
  }
  const w = windows.get(key);
  if (!w || now - w.at >= windowMs) {
    windows.set(key, { at: now, n: 1 });
    return false;
  }
  w.n += 1;
  return w.n > limit;
}
