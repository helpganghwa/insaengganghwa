import 'server-only';

import { createPrivateKey, sign } from 'node:crypto';

import { decodeJwsPayload, type AppleTransaction } from './apple-jws';

/**
 * App Store Server API 최소 클라이언트 — docs/APPSTORE.md §3.3.
 * 외부 SDK 없이 In-App Purchase 키(.p8)로 ES256 JWT를 만들어 fetch. 이 파일만 Apple과 통신하고
 * purchase/refund/apple/웹훅은 여기 함수를 호출한다(테스트는 이 모듈을 mock).
 *
 * env(서버 전용, Vercel Production/Preview 분리 입력 — 로컬에 두지 않는다):
 *  - APPLE_BUNDLE_ID   기본 app.ganghwa.game
 *  - ASC_IAP_KEY_P8    In-App Purchase 키 내용(-----BEGIN PRIVATE KEY----- …, 줄바꿈은 \n 이스케이프 허용)
 *    또는 ASC_IAP_KEY_P8_B64(같은 내용 base64)
 *  - ASC_IAP_KEY_ID    키 ID(10자) · ASC_ISSUER_ID  발급자 ID(UUID)
 *
 * 거래 조회는 Production → 404면 Sandbox 순서(Apple 권장). 응답 JWS는 Apple에서 TLS로 직접 받았으므로
 * 서명 검증 없이 payload를 신뢰한다(웹훅의 미검증 payload는 반드시 여기로 재조회해 확정).
 */

const PROD = 'https://api.storekit.itunes.apple.com';
const SANDBOX = 'https://api.storekit-sandbox.itunes.apple.com';

export class AppleApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = 'AppleApiError';
  }
}

export function appleBundleId(): string {
  return (process.env.APPLE_BUNDLE_ID || 'app.ganghwa.game').trim();
}

type IapKey = { p8: string; kid: string; iss: string };

function loadKey(): IapKey | null {
  const raw =
    process.env.ASC_IAP_KEY_P8 ||
    (process.env.ASC_IAP_KEY_P8_B64 ? Buffer.from(process.env.ASC_IAP_KEY_P8_B64, 'base64').toString('utf8') : '');
  const p8 = raw.replace(/\\n/g, '\n').trim();
  const kid = (process.env.ASC_IAP_KEY_ID || '').trim();
  const iss = (process.env.ASC_ISSUER_ID || '').trim();
  if (!p8 || !kid || !iss) return null;
  return { p8, kid, iss };
}

/** Apple 결제 서버 검증이 가능한 상태인지(키 존재). 미설정이면 createAppleOrder가 CONFIG로 거부. */
export function appleConfigured(): boolean {
  return loadKey() !== null;
}

const b64url = (s: string | Buffer) => Buffer.from(s).toString('base64url');

let jwtCache: { token: string; exp: number } | null = null;

/** ES256 JWT(20분, aud appstoreconnect-v1, bid 번들). 만료 60초 전까지 모듈 캐시. */
function apiJwt(): string {
  const now = Math.floor(Date.now() / 1000);
  if (jwtCache && jwtCache.exp - 60 > now) return jwtCache.token;
  const key = loadKey();
  if (!key) throw new AppleApiError(0, 'ASC_IAP_KEY missing');
  const exp = now + 20 * 60;
  const header = b64url(JSON.stringify({ alg: 'ES256', kid: key.kid, typ: 'JWT' }));
  const payload = b64url(JSON.stringify({ iss: key.iss, iat: now, exp, aud: 'appstoreconnect-v1', bid: appleBundleId() }));
  // JOSE ES256은 DER이 아니라 r||s 64바이트(ieee-p1363) 서명이어야 한다.
  const sig = sign('sha256', Buffer.from(`${header}.${payload}`), {
    key: createPrivateKey(key.p8),
    dsaEncoding: 'ieee-p1363',
  });
  const token = `${header}.${payload}.${b64url(sig)}`;
  jwtCache = { token, exp };
  return token;
}

async function call<T>(base: string, path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: { ...(init.headers ?? {}), authorization: `Bearer ${apiJwt()}`, accept: 'application/json' },
  });
  if (!res.ok) throw new AppleApiError(res.status, `${path} ${res.status} ${(await res.text()).slice(0, 300)}`);
  const text = await res.text();
  return (text ? JSON.parse(text) : {}) as T;
}

/**
 * 거래 1건 조회 — `GET /inApps/v1/transactions/{transactionId}`. Production에 없으면(404) Sandbox 재시도.
 * 어느 쪽에도 없으면 404 AppleApiError. payload 해독 실패는 502로 취급.
 */
export async function getAppleTransaction(transactionId: string): Promise<AppleTransaction> {
  const path = `/inApps/v1/transactions/${encodeURIComponent(transactionId)}`;
  let j: { signedTransactionInfo?: string };
  try {
    j = await call<{ signedTransactionInfo?: string }>(PROD, path);
  } catch (e) {
    if (!(e instanceof AppleApiError) || e.status !== 404) throw e;
    j = await call<{ signedTransactionInfo?: string }>(SANDBOX, path);
  }
  const t = j.signedTransactionInfo ? decodeJwsPayload<AppleTransaction>(j.signedTransactionInfo) : null;
  if (!t || !t.transactionId) throw new AppleApiError(502, `${path} malformed signedTransactionInfo`);
  return t;
}
