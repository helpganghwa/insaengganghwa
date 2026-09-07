/**
 * APNs 기기 토큰 ↔ push_subscriptions.endpoint 인코딩(순수, 클라·서버 공용) — docs/APPSTORE.md §3.4.
 *
 * 스키마 변경 없이 같은 테이블을 쓴다: 웹푸시 행은 endpoint가 https URL, iOS 앱 행은 `apns:<env>:<token>`.
 * 유저별 구독 조회·삭제·토글 게이팅이 그대로 두 종류를 함께 돌려주고, 발송(send.ts)만 접두로 갈라 보낸다.
 * env는 빌드 환경(TestFlight/개발 = sandbox, App Store = production) — APNs 호스트가 다르다.
 */
export const APNS_PREFIX = 'apns:';

export type ApnsEnv = 'sandbox' | 'production';

export function apnsEndpoint(env: ApnsEnv, token: string): string {
  return `${APNS_PREFIX}${env}:${token.toLowerCase()}`;
}

export function isApnsEndpoint(endpoint: string): boolean {
  return endpoint.startsWith(APNS_PREFIX);
}

export function parseApnsEndpoint(endpoint: string): { env: ApnsEnv; token: string } | null {
  if (!isApnsEndpoint(endpoint)) return null;
  const rest = endpoint.slice(APNS_PREFIX.length);
  const i = rest.indexOf(':');
  if (i <= 0) return null;
  const env = rest.slice(0, i);
  const token = rest.slice(i + 1);
  if ((env !== 'sandbox' && env !== 'production') || !/^[0-9a-f]{64,200}$/.test(token)) return null;
  return { env, token };
}
