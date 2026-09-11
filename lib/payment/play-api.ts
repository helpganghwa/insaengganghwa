import 'server-only';

import { createSign } from 'node:crypto';

/**
 * Google Play Developer API(androidpublisher v3) 최소 클라이언트 — docs/PLAYSTORE.md §3.2.
 * 외부 SDK 없이 서비스 계정 JWT → 액세스 토큰 → fetch. 이 파일만 구글과 통신하고
 * purchase/refund/play는 여기 함수를 호출한다(테스트는 이 모듈을 mock).
 *
 * env(서버 전용, Vercel Production/Preview 분리 입력 — 로컬에 두지 않는다):
 *  - PLAY_PACKAGE_NAME             기본 app.ganghwa.game
 *  - PLAY_SERVICE_ACCOUNT_JSON     서비스 계정 키 JSON 원문(한 줄) 또는
 *  - PLAY_SERVICE_ACCOUNT_JSON_B64 같은 내용 base64
 * 서비스 계정은 Play Console 사용자·권한에서 "주문 관리·재무 데이터 보기·앱 정보 보기"가 있어야 한다.
 */

const SCOPE = 'https://www.googleapis.com/auth/androidpublisher';
const API = 'https://androidpublisher.googleapis.com/androidpublisher/v3/applications';

type ServiceAccount = { client_email: string; private_key: string; token_uri?: string };

export class PlayApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = 'PlayApiError';
  }
}

export function playPackageName(): string {
  return (process.env.PLAY_PACKAGE_NAME || 'app.ganghwa.game').trim();
}

function loadServiceAccount(): ServiceAccount | null {
  const raw =
    process.env.PLAY_SERVICE_ACCOUNT_JSON ||
    (process.env.PLAY_SERVICE_ACCOUNT_JSON_B64
      ? Buffer.from(process.env.PLAY_SERVICE_ACCOUNT_JSON_B64, 'base64').toString('utf8')
      : '');
  if (!raw) return null;
  try {
    const j = JSON.parse(raw) as Partial<ServiceAccount>;
    if (!j.client_email || !j.private_key) return null;
    return { client_email: j.client_email, private_key: j.private_key, token_uri: j.token_uri };
  } catch {
    return null;
  }
}

/** Play 결제 서버 검증이 가능한 상태인지(서비스 계정 키 존재). 미설정이면 createPlayOrder가 CONFIG로 거부. */
export function playConfigured(): boolean {
  return loadServiceAccount() !== null;
}

const b64url = (s: string | Buffer) => Buffer.from(s).toString('base64url');

let tokenCache: { token: string; exp: number } | null = null;

/** 서비스 계정 JWT(RS256, 1시간) → OAuth2 액세스 토큰. 만료 60초 전까지 모듈 캐시. */
async function accessToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (tokenCache && tokenCache.exp - 60 > now) return tokenCache.token;
  const sa = loadServiceAccount();
  if (!sa) throw new PlayApiError(0, 'PLAY_SERVICE_ACCOUNT missing');
  const tokenUri = sa.token_uri || 'https://oauth2.googleapis.com/token';
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = b64url(
    JSON.stringify({ iss: sa.client_email, scope: SCOPE, aud: tokenUri, iat: now, exp: now + 3600 }),
  );
  const signer = createSign('RSA-SHA256');
  signer.update(`${header}.${claim}`);
  const sig = signer.sign(sa.private_key, 'base64url');
  const res = await fetch(tokenUri, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${header}.${claim}.${sig}`,
    }),
  });
  if (!res.ok) throw new PlayApiError(res.status, `token ${res.status} ${(await res.text()).slice(0, 200)}`);
  const j = (await res.json()) as { access_token: string; expires_in: number };
  tokenCache = { token: j.access_token, exp: now + (j.expires_in ?? 3600) };
  return j.access_token;
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await accessToken();
  const res = await fetch(`${API}/${encodeURIComponent(playPackageName())}${path}`, {
    ...init,
    headers: { ...(init.headers ?? {}), authorization: `Bearer ${token}`, accept: 'application/json' },
  });
  if (!res.ok) throw new PlayApiError(res.status, `${path} ${res.status} ${(await res.text()).slice(0, 300)}`);
  const text = await res.text();
  return (text ? JSON.parse(text) : {}) as T;
}

/**
 * purchases.products.get 응답(필요한 필드만).
 *  purchaseState: 0 구매완료 · 1 취소됨 · 2 보류(pending)
 *  consumptionState: 0 미소모 · 1 소모됨 / acknowledgementState: 0 미확인 · 1 확인됨
 *  purchaseType: 0 테스트(라이선스 테스터) · 1 프로모 · 2 리워드 — 없으면 실결제
 */
export type PlayProductPurchase = {
  purchaseState: number;
  consumptionState: number;
  acknowledgementState?: number;
  orderId?: string;
  purchaseTimeMillis?: string;
  purchaseType?: number;
  quantity?: number;
  regionCode?: string;
  productId?: string;
};

export async function getPlayProductPurchase(sku: string, purchaseToken: string): Promise<PlayProductPurchase> {
  return call<PlayProductPurchase>(
    `/purchases/products/${encodeURIComponent(sku)}/tokens/${encodeURIComponent(purchaseToken)}`,
  );
}

/** 소모 처리 — 소모성 상품은 소모해야 재구매 가능하고, 소모가 곧 확인(acknowledge)이라 3일 자동환불을 막는다. */
export async function consumePlayProductPurchase(sku: string, purchaseToken: string): Promise<void> {
  await call<unknown>(
    `/purchases/products/${encodeURIComponent(sku)}/tokens/${encodeURIComponent(purchaseToken)}:consume`,
    { method: 'POST' },
  );
}

/** 구글 주문 환불(revoke=true면 권한도 회수). 미성년 한도 초과 자동 환불·어드민 환불이 쓴다. */
export async function refundPlayOrder(orderId: string, revoke = true): Promise<void> {
  await call<unknown>(`/orders/${encodeURIComponent(orderId)}:refund?revoke=${revoke ? 'true' : 'false'}`, {
    method: 'POST',
  });
}

/**
 * 인앱 상품(일회성 상품) — 2026-09-11 확인: 구 `inappproducts`는 폐기됐다("Please migrate to the new
 * publishing API" 403). 현행은 `oneTimeProducts`이며 상품 아래 **구매 옵션**을 두고 지역별 가격을 건다.
 * 경로 표기 주의: 레퍼런스의 `monetization.` 접두는 메서드 네임스페이스일 뿐 URL에는 없고, 컬렉션은
 * 카멜케이스 `oneTimeProducts`다(`/monetization/onetimeproducts`는 404).
 */
export type PlayOneTimeProduct = {
  productId: string;
  listings?: { languageCode?: string; title?: string; description?: string }[];
  purchaseOptions?: {
    purchaseOptionId?: string;
    /** 출력 전용 — 생성 직후 DRAFT라 activate가 따로 필요하다. */
    state?: string;
    regionalPricingAndAvailabilityConfigs?: { regionCode?: string; price?: { currencyCode?: string; units?: string; nanos?: number } }[];
  }[];
};

/** 지역 버전 — 가격 해석 기준. 낡은 값을 보내면 서버가 최신으로 올리며 신규 지역을 덧붙인다. */
const PLAY_REGIONS_VERSION = '2025/03';
/** 한국만 판매하지만 API가 신규 지역 기준가(USD·EUR)를 요구한다. 배포 국가가 한국뿐이라 실제로는 쓰이지 않는다. */
const KRW_PER_USD = 1350;
const KRW_PER_EUR = 1450;

function money(currencyCode: string, amount: number) {
  const cents = Math.max(1, Math.round(amount * 100));
  return { currencyCode, units: String(Math.floor(cents / 100)), nanos: (cents % 100) * 10_000_000 };
}

/** 등록된 일회성 상품 전체. 없으면 빈 배열(204). */
export async function listPlayOneTimeProducts(): Promise<PlayOneTimeProduct[]> {
  const r = await call<{ oneTimeProducts?: PlayOneTimeProduct[] }>('/oneTimeProducts');
  return r.oneTimeProducts ?? [];
}

/**
 * 일회성 상품 생성·수정(batchUpdate) — 개별 PATCH 경로는 라우팅되지 않아 배치가 유일한 쓰기 경로다.
 * 생성만 하면 구매 옵션이 DRAFT라 팔리지 않는다 — 반드시 activatePlayPurchaseOption을 이어서 부른다.
 */
export async function upsertPlayOneTimeProducts(
  items: { sku: string; krw: number; title: string; description: string }[],
): Promise<void> {
  if (!items.length) return;
  await call('/oneTimeProducts:batchUpdate', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      requests: items.map((it) => ({
        oneTimeProduct: {
          packageName: playPackageName(),
          productId: it.sku,
          listings: [{ languageCode: 'ko-KR', title: it.title, description: it.description }],
          purchaseOptions: [
            {
              purchaseOptionId: 'default',
              // legacyCompatible — TWA의 PaymentRequest(sku 단건)가 이 구매 옵션을 집는다.
              buyOption: { legacyCompatible: true },
              regionalPricingAndAvailabilityConfigs: [
                { regionCode: 'KR', price: { currencyCode: 'KRW', units: String(it.krw), nanos: 0 }, availability: 'AVAILABLE' },
              ],
              // 신규 지역은 AVAILABLE만 허용된다(NO_LONGER_AVAILABLE로는 생성 불가).
              newRegionsConfig: {
                usdPrice: money('USD', it.krw / KRW_PER_USD),
                eurPrice: money('EUR', it.krw / KRW_PER_EUR),
                availability: 'AVAILABLE',
              },
            },
          ],
        },
        updateMask: 'listings,purchaseOptions',
        allowMissing: true,
        regionsVersion: { version: PLAY_REGIONS_VERSION },
      })),
    }),
  });
}

/** 구매 옵션 활성화(DRAFT → ACTIVE). 상품별 경로라 상품 수만큼 호출한다. */
export async function activatePlayPurchaseOption(sku: string, purchaseOptionId = 'default'): Promise<void> {
  await call(`/oneTimeProducts/${encodeURIComponent(sku)}/purchaseOptions:batchUpdateStates`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      requests: [
        { activatePurchaseOptionRequest: { packageName: playPackageName(), productId: sku, purchaseOptionId } },
      ],
    }),
  });
}

export type PlayVoidedPurchase = {
  purchaseToken: string;
  orderId: string;
  purchaseTimeMillis?: string;
  voidedTimeMillis?: string;
  /** 0 기타 · 1 리모스(환불 요청) · 2 미확인 자동취소 · 3 지불거절 · 4 우발적 구매 · 5 사기 · 6 친구 구매 · 7 불법 */
  voidedReason?: number;
  /** 0 유저 · 1 개발자 · 2 구글 */
  voidedSource?: number;
};

/** 환불·취소된 구매 목록(startTime 이후, 일회성 상품만). 페이지네이션은 토큰으로 이어 받는다. */
export async function listPlayVoidedPurchases(startTimeMs: number): Promise<PlayVoidedPurchase[]> {
  const out: PlayVoidedPurchase[] = [];
  let pageToken: string | undefined;
  for (let i = 0; i < 20; i++) {
    const qs = new URLSearchParams({ startTime: String(startTimeMs), type: '0', maxResults: '1000' });
    if (pageToken) qs.set('token', pageToken);
    const j = await call<{ voidedPurchases?: PlayVoidedPurchase[]; tokenPagination?: { nextPageToken?: string } }>(
      `/purchases/voidedpurchases?${qs.toString()}`,
    );
    out.push(...(j.voidedPurchases ?? []));
    pageToken = j.tokenPagination?.nextPageToken;
    if (!pageToken) break;
  }
  return out;
}
