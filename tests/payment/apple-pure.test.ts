import { describe, expect, it } from 'vitest';

import {
  appleAccountTokenOf,
  checkAppleTransaction,
  decodeJwsPayload,
  sandboxAllowed,
  type AppleTransaction,
} from '@/lib/payment/apple-jws';
import { appleProductCatalog, appleProductIdFor } from '@/lib/payment/apple-sku';
import { playSkuFor } from '@/lib/payment/play-sku';

const b64url = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jws = (payload: unknown) => `${b64url({ alg: 'ES256' })}.${b64url(payload)}.sig`;

const BUNDLE = 'app.ganghwa.game';
const TOKEN = '0f3c9a2e-1b4d-4c8e-9a7f-2d6e8b1c3a5f';
const base: AppleTransaction = {
  transactionId: '2000000123456789',
  originalTransactionId: '2000000123456789',
  bundleId: BUNDLE,
  productId: 'dia_starter',
  environment: 'Production',
  appAccountToken: TOKEN,
  type: 'Consumable',
};

describe('Apple 인앱 결제 — 순수 헬퍼', () => {
  it('JWS payload 해독: 정상·형식 불량', () => {
    expect(decodeJwsPayload<{ a: number }>(jws({ a: 1 }))).toEqual({ a: 1 });
    expect(decodeJwsPayload('not-a-jws')).toBeNull();
    expect(decodeJwsPayload('a.b')).toBeNull();
    expect(decodeJwsPayload(`x.${Buffer.from('{bad').toString('base64url')}.y`)).toBeNull();
  });

  it('거래 대조: 번들·상품·계정 토큰(대소문자 무시)·환불·유형', () => {
    const expect_ = { bundleId: BUNDLE, productId: 'dia_starter', appAccountToken: TOKEN };
    expect(checkAppleTransaction(base, expect_)).toEqual({ ok: true });
    expect(checkAppleTransaction({ ...base, appAccountToken: TOKEN.toUpperCase() }, expect_)).toEqual({ ok: true });
    expect(checkAppleTransaction({ ...base, bundleId: 'com.other' }, expect_)).toEqual({ ok: false, reason: 'BUNDLE' });
    expect(checkAppleTransaction({ ...base, productId: 'dia_mega' }, expect_)).toEqual({ ok: false, reason: 'PRODUCT' });
    expect(checkAppleTransaction({ ...base, appAccountToken: undefined }, expect_)).toEqual({ ok: false, reason: 'ACCOUNT' });
    expect(checkAppleTransaction({ ...base, revocationDate: 1_700_000_000_000 }, expect_)).toEqual({ ok: false, reason: 'REVOKED' });
    expect(checkAppleTransaction({ ...base, type: 'Auto-Renewable Subscription' }, expect_)).toEqual({ ok: false, reason: 'TYPE' });
  });

  it('주문번호 → appAccountToken(UUID)', () => {
    expect(appleAccountTokenOf(`ap-${TOKEN}`)).toBe(TOKEN);
    expect(appleAccountTokenOf(`ap-${TOKEN.toUpperCase()}`)).toBe(TOKEN);
    expect(appleAccountTokenOf(`gp-${TOKEN}`)).toBeNull();
    expect(appleAccountTokenOf('ap-short')).toBeNull();
  });

  it('Sandbox 허용: 심사 계정 또는 스테이징 env', () => {
    expect(sandboxAllowed({ reviewer: true, allowEnv: undefined })).toBe(true);
    expect(sandboxAllowed({ reviewer: false, allowEnv: '1' })).toBe(true);
    expect(sandboxAllowed({ reviewer: false, allowEnv: undefined })).toBe(false);
    expect(sandboxAllowed({ reviewer: false, allowEnv: '0' })).toBe(false);
  });

  it('상품 ID는 Play SKU와 같은 문자열, 카탈로그 22종', () => {
    for (const p of ['d1', 'w2', 'm3', 'starter', 'mega', 'premium', 'first_special', 'bp_enhance_0', 'bp_transcend_3']) {
      expect(appleProductIdFor(p)).toBe(playSkuFor(p));
    }
    expect(appleProductIdFor('nope')).toBeNull();
    expect(appleProductCatalog()).toHaveLength(22);
  });
});
