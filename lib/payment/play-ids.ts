import { createHash } from 'node:crypto';

/**
 * Play 결제 귀속 표식(docs/PLAYSTORE.md "결제 귀속 표식") — 순수 모듈(DB·구글 호출 없음, 단위 테스트 대상).
 *
 * 결제마다 구글 BillingFlowParams에 obfuscatedAccountId(계정)·obfuscatedProfileId(주문번호)를 싣고, 구글이 구매 조회에
 * 돌려준 값으로 주문을 찾는다. 표식은 앱이 보낸 값이라 **조회 열쇠일 뿐 권위가 아니다** — 판정은 주문 행과 구글 응답으로 한다.
 */

/**
 * 계정 표식 — sha256("ganghwa-play:" + userId)의 base64url 43자.
 * 구글 규칙: 64자 이하·개인정보 원문 금지. 유저 id(uuid)를 그대로 싣지 않고 해시한다.
 * ⚠ 한 번 배포하면 바꾸지 않는다 — 바꾸면 이전 결제의 계정 대조가 전부 불일치가 된다.
 */
export function playAccountId(userId: string): string {
  return createHash('sha256').update(`ganghwa-play:${userId}`).digest('base64url').slice(0, 43);
}

/** 판정에 쓰는 주문 행 요약. */
export type AttributionOrder = {
  userId: string;
  provider: string;
  playSku: string | null;
  status: string;
  token: string | null;
};

/**
 * - grant: 미완 주문(토큰 없음, 또는 같은 토큰이 먼저 묶임) → 주문 주인에게 지급
 * - already: 이 토큰으로 이미 끝난 주문 → 할 일 없음
 * - duplicate: 주문이 다른 토큰으로 이미 지급·환불됐거나 다른 토큰이 묶임 → 중복 청구(자동 환불)
 * - mismatch: 주문 없음·다른 결제수단·다른 상품·계정 불일치 → 지급 금지(자동 환불 + 경보)
 */
export type AttributionDecision = 'grant' | 'already' | 'duplicate' | 'mismatch';

export function decideAttribution(
  order: AttributionOrder | null,
  p: { sku: string; accountId: string; token: string },
): AttributionDecision {
  if (!order || order.provider !== 'play' || order.playSku !== p.sku) return 'mismatch';
  if (playAccountId(order.userId) !== p.accountId) return 'mismatch';
  const open = order.status === 'pending' || order.status === 'expired';
  if (order.token === p.token) return open ? 'grant' : 'already';
  if (order.token === null && open) return 'grant';
  return 'duplicate';
}
