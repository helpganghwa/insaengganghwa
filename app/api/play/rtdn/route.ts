import { createPublicKey, createVerify } from 'node:crypto';

import { playServiceAccountEmail } from '@/lib/payment/play-api';
import { handleOneTimePurchase } from '@/lib/payment/play-rtdn';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * 구글 실시간 개발자 알림(RTDN) 수신 — Pub/Sub 푸시 구독의 엔드포인트(2026-09-24, docs/PLAYSTORE.md).
 * 인증: Pub/Sub 푸시의 OIDC 토큰(구글 서명 JWT). 서명(구글 공개키)·발급자·대상(이 URL)·발급 서비스 계정(= Play 서비스 계정)을
 * 확인한다. 설령 뚫려도 구매는 전부 구글 API로 재검증하므로 가짜 토큰으로는 지급되지 않는다.
 * 응답: 처리했거나 무시할 알림은 204(재전송 중단), 일시 오류는 500(Pub/Sub가 재전송 — 처리 로직은 멱등).
 */
const AUDIENCE = 'https://ganghwa.app/api/play/rtdn';

type Jwk = { kid: string; kty: string; n: string; e: string; alg?: string };
let jwksCache: { keys: Jwk[]; exp: number } | null = null;
async function googleKeys(): Promise<Jwk[]> {
  if (jwksCache && jwksCache.exp > Date.now()) return jwksCache.keys;
  const res = await fetch('https://www.googleapis.com/oauth2/v3/certs');
  if (!res.ok) throw new Error(`jwks ${res.status}`);
  const j = (await res.json()) as { keys: Jwk[] };
  jwksCache = { keys: j.keys, exp: Date.now() + 60 * 60_000 };
  return j.keys;
}

async function verifyPushToken(auth: string | null): Promise<boolean> {
  const m = auth?.match(/^Bearer (.+)$/);
  if (!m) return false;
  const [h, p, s] = m[1]!.split('.');
  if (!h || !p || !s) return false;
  try {
    const header = JSON.parse(Buffer.from(h, 'base64url').toString()) as { kid?: string; alg?: string };
    if (header.alg !== 'RS256') return false;
    const key = (await googleKeys()).find((k) => k.kid === header.kid);
    if (!key) return false;
    const pub = createPublicKey({ key: { kty: key.kty, n: key.n, e: key.e }, format: 'jwk' });
    const ok = createVerify('RSA-SHA256').update(`${h}.${p}`).verify(pub, Buffer.from(s, 'base64url'));
    if (!ok) return false;
    const c = JSON.parse(Buffer.from(p, 'base64url').toString()) as { iss?: string; aud?: string; exp?: number; email?: string; email_verified?: boolean };
    const now = Date.now() / 1000;
    const expected = playServiceAccountEmail();
    return (
      (c.iss === 'https://accounts.google.com' || c.iss === 'accounts.google.com') &&
      c.aud === AUDIENCE &&
      typeof c.exp === 'number' && c.exp > now &&
      !!expected && c.email === expected && c.email_verified === true
    );
  } catch {
    return false;
  }
}

type Notification = {
  packageName?: string;
  oneTimeProductNotification?: { notificationType?: number; purchaseToken?: string; sku?: string };
  testNotification?: unknown;
};

export async function POST(req: Request) {
  if (!(await verifyPushToken(req.headers.get('authorization')))) return new Response('forbidden', { status: 403 });
  const body = (await req.json().catch(() => null)) as { message?: { data?: string; messageId?: string } } | null;
  let n: Notification = {};
  try {
    n = JSON.parse(Buffer.from(body?.message?.data ?? '', 'base64').toString('utf8')) as Notification;
  } catch {
    return new Response(null, { status: 204 });
  }
  if (n.testNotification) {
    console.log('[play-rtdn] test notification', body?.message?.messageId);
    return new Response(null, { status: 204 });
  }
  const o = n.oneTimeProductNotification;
  // 1 = ONE_TIME_PRODUCT_PURCHASED. 취소(2)·구독·환불은 기존 play-sync 크론(voided)이 맡는다.
  if (!o || o.notificationType !== 1 || !o.purchaseToken || !o.sku) return new Response(null, { status: 204 });
  try {
    const out = await handleOneTimePurchase(o.sku, o.purchaseToken);
    console.log('[play-rtdn]', o.sku, JSON.stringify(out));
    return new Response(null, { status: 204 });
  } catch (e) {
    console.error('[play-rtdn] failed', o.sku, (e as Error).message);
    return new Response('retry', { status: 500 });
  }
}
