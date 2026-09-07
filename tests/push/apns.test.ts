import { createPublicKey, generateKeyPairSync, verify } from 'node:crypto';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { apnsEndpoint, isApnsEndpoint, parseApnsEndpoint } from '@/lib/push/apns-endpoint';

const TOKEN = 'a'.repeat(64);

describe('APNs endpoint 인코딩', () => {
  it('encode/parse 왕복, 대문자 토큰은 소문자로', () => {
    const e = apnsEndpoint('production', TOKEN.toUpperCase());
    expect(e).toBe(`apns:production:${TOKEN}`);
    expect(isApnsEndpoint(e)).toBe(true);
    expect(parseApnsEndpoint(e)).toEqual({ env: 'production', token: TOKEN });
    expect(parseApnsEndpoint(apnsEndpoint('sandbox', TOKEN))).toEqual({ env: 'sandbox', token: TOKEN });
  });
  it('웹푸시 URL·형식 불량은 null', () => {
    expect(isApnsEndpoint('https://fcm.googleapis.com/x')).toBe(false);
    expect(parseApnsEndpoint('https://fcm.googleapis.com/x')).toBeNull();
    expect(parseApnsEndpoint('apns:staging:' + TOKEN)).toBeNull();
    expect(parseApnsEndpoint('apns:production:zz')).toBeNull();
  });
});

describe('APNs 발송(서버)', () => {
  let pubPem = '';
  beforeAll(() => {
    const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    process.env.APNS_KEY_P8 = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
    process.env.APNS_KEY_ID = 'ABC123DEF4';
    process.env.APNS_TEAM_ID = 'TEAM123456';
    process.env.APPLE_BUNDLE_ID = 'app.ganghwa.game';
    pubPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
  });

  it('JWT: ES256(ieee-p1363) 서명이 공개키로 검증되고 50분 캐시', async () => {
    const { apnsJwt, _resetApnsJwtCache } = await import('@/lib/push/apns');
    _resetApnsJwtCache();
    const now = 1_800_000_000;
    const jwt = apnsJwt(now);
    const [h, p, s] = jwt.split('.');
    expect(JSON.parse(Buffer.from(h!, 'base64url').toString())).toEqual({ alg: 'ES256', kid: 'ABC123DEF4' });
    expect(JSON.parse(Buffer.from(p!, 'base64url').toString())).toEqual({ iss: 'TEAM123456', iat: now });
    const ok = verify('sha256', Buffer.from(`${h}.${p}`), { key: createPublicKey(pubPem), dsaEncoding: 'ieee-p1363' }, Buffer.from(s!, 'base64url'));
    expect(ok).toBe(true);
    expect(apnsJwt(now + 49 * 60)).toBe(jwt);
    expect(apnsJwt(now + 51 * 60)).not.toBe(jwt);
  });

  it('본문·헤더: aps.alert/url/thread-id, collapse-id는 ASCII tag만', async () => {
    const { apnsBody, apnsHeaders, classifyApnsResponse } = await import('@/lib/push/apns');
    const payload = { title: '강화 완료', body: '+10 성공', url: '/enhance', tag: 'enhance', category: 'enhance' as const };
    const body = JSON.parse(apnsBody(payload));
    expect(body.aps.alert).toEqual({ title: '강화 완료', body: '+10 성공' });
    expect(body.aps['thread-id']).toBe('enhance');
    expect(body.url).toBe('/enhance');
    const h = apnsHeaders(payload, 'jwt', 'app.ganghwa.game', 1_800_000_000_000);
    expect(h['apns-topic']).toBe('app.ganghwa.game');
    expect(h['apns-collapse-id']).toBe('enhance');
    expect(h['apns-expiration']).toBe(String(1_800_000_000 + 3600));
    expect(apnsHeaders({ ...payload, tag: '한글태그' }, 'jwt', 't')['apns-collapse-id']).toBeUndefined();

    expect(classifyApnsResponse(200, '')).toBe('ok');
    expect(classifyApnsResponse(410, '{"reason":"Unregistered"}')).toBe('gone');
    expect(classifyApnsResponse(400, '{"reason":"BadDeviceToken"}')).toBe('gone');
    expect(classifyApnsResponse(403, '{"reason":"InvalidProviderToken"}')).toBe('sender');
    expect(classifyApnsResponse(400, '{"reason":"TopicDisallowed"}')).toBe('sender');
    expect(classifyApnsResponse(429, '{"reason":"TooManyRequests"}')).toBe('failed');
    expect(classifyApnsResponse(503, 'oops')).toBe('failed');
  });

  it('sendApns: 200/410/403을 ok·gone(dead)·sender(failed, 삭제 안 함)로 집계', async () => {
    const { sendApns } = await import('@/lib/push/apns');
    const send = vi.fn(async (_env: string, path: string) => {
      if (path.endsWith('b'.repeat(64))) return { status: 410, body: '{"reason":"Unregistered"}' };
      if (path.endsWith('c'.repeat(64))) return { status: 403, body: '{"reason":"ExpiredProviderToken"}' };
      return { status: 200, body: '' };
    });
    const close = vi.fn(async () => undefined);
    const subs = [
      { id: 1n, endpoint: apnsEndpoint('production', 'a'.repeat(64)) },
      { id: 2n, endpoint: apnsEndpoint('sandbox', 'b'.repeat(64)) },
      { id: 3n, endpoint: apnsEndpoint('production', 'c'.repeat(64)) },
      { id: 4n, endpoint: 'apns:broken' },
    ];
    const r = await sendApns(subs, { title: 't', body: 'b', category: 'admin' }, { send, close });
    expect({ ...r, dead: [...r.dead].sort((a, b) => (a < b ? -1 : 1)) }).toEqual({ ok: 1, gone: 2, failed: 1, dead: [2n, 4n], senderKeyMismatch: true });
    expect(send).toHaveBeenCalledTimes(3);
    expect(send.mock.calls[1]![0]).toBe('sandbox');
    expect(close).toHaveBeenCalledTimes(1);
  });
});
