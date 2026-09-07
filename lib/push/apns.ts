import 'server-only';

import { connect, constants as h2c, type ClientHttp2Session } from 'node:http2';
import { createPrivateKey, sign } from 'node:crypto';

import { parseApnsEndpoint, type ApnsEnv } from './apns-endpoint';
import type { PushPayload } from './send';

/**
 * APNs 발송 — docs/APPSTORE.md §3.4. 외부 SDK 없이 토큰 인증(.p8, ES256 JWT) + HTTP/2.
 * send.ts의 dispatch가 `apns:` 접두 구독만 여기로 넘긴다. 이 파일만 Apple 푸시 서버와 통신한다.
 *
 * env(서버 전용, Vercel Production/Preview 분리 입력 — 로컬에 두지 않는다):
 *  - APNS_KEY_P8 (또는 APNS_KEY_P8_B64) · APNS_KEY_ID · APNS_TEAM_ID · APPLE_BUNDLE_ID(기본 app.ganghwa.game)
 *
 * 응답 처리 규칙(웹푸시와 대칭):
 *  - 410 / 400 BadDeviceToken·DeviceTokenNotForTopic → 죽은 토큰(gone) → 구독 삭제
 *  - 403(InvalidProviderToken 등)·400 TopicDisallowed·MissingTopic → **발신 키/설정 문제** → 실패로만 집계, 삭제 금지
 *  - 429·5xx·네트워크 → 실패(다음 발송에 재시도)
 */

const HOST: Record<ApnsEnv, string> = {
  production: 'https://api.push.apple.com',
  sandbox: 'https://api.sandbox.push.apple.com',
};

type ApnsKey = { p8: string; kid: string; teamId: string };

function loadKey(): ApnsKey | null {
  const raw =
    process.env.APNS_KEY_P8 ||
    (process.env.APNS_KEY_P8_B64 ? Buffer.from(process.env.APNS_KEY_P8_B64, 'base64').toString('utf8') : '');
  const p8 = raw.replace(/\\n/g, '\n').trim();
  const kid = (process.env.APNS_KEY_ID || '').trim();
  const teamId = (process.env.APNS_TEAM_ID || '').trim();
  if (!p8 || !kid || !teamId) return null;
  return { p8, kid, teamId };
}

export function apnsConfigured(): boolean {
  return loadKey() !== null;
}

export function apnsTopic(): string {
  return (process.env.APPLE_BUNDLE_ID || 'app.ganghwa.game').trim();
}

const b64url = (s: string | Buffer) => Buffer.from(s).toString('base64url');

let jwtCache: { token: string; iat: number } | null = null;
/** Apple 규칙: 토큰 유효 60분, 갱신은 20분에 1회 이하 — 50분마다 재발급. */
const JWT_TTL_S = 50 * 60;

export function apnsJwt(now = Math.floor(Date.now() / 1000)): string {
  if (jwtCache && now - jwtCache.iat < JWT_TTL_S) return jwtCache.token;
  const key = loadKey();
  if (!key) throw new Error('APNS key missing');
  const header = b64url(JSON.stringify({ alg: 'ES256', kid: key.kid }));
  const payload = b64url(JSON.stringify({ iss: key.teamId, iat: now }));
  // JOSE ES256 = r||s 64바이트(ieee-p1363), DER 아님.
  const sig = sign('sha256', Buffer.from(`${header}.${payload}`), { key: createPrivateKey(key.p8), dsaEncoding: 'ieee-p1363' });
  const token = `${header}.${payload}.${b64url(sig)}`;
  jwtCache = { token, iat: now };
  return token;
}

/** 테스트용 — 캐시 초기화. */
export function _resetApnsJwtCache(): void {
  jwtCache = null;
}

/** APNs 알림 본문 — 제목/본문/소리 + 앱이 탭 시 이동할 url. thread-id로 카테고리별 묶음. */
export function apnsBody(payload: PushPayload): string {
  return JSON.stringify({
    aps: {
      alert: { title: payload.title, body: payload.body },
      sound: 'default',
      'thread-id': payload.category,
    },
    url: payload.url ?? '/',
    tag: payload.tag ?? payload.category,
    category: payload.category,
  });
}

/** 요청 헤더 — collapse-id는 ASCII 64바이트 이하일 때만(웹푸시 tag 대응). */
export function apnsHeaders(payload: PushPayload, jwt: string, topic: string, now = Date.now()): Record<string, string> {
  const tag = payload.tag ?? payload.category;
  const h: Record<string, string> = {
    authorization: `bearer ${jwt}`,
    'apns-topic': topic,
    'apns-push-type': 'alert',
    'apns-priority': '10',
    'apns-expiration': String(Math.floor(now / 1000) + 3600),
    'content-type': 'application/json',
  };
  if (/^[\x20-\x7e]{1,64}$/.test(tag)) h['apns-collapse-id'] = tag;
  return h;
}

export type ApnsOutcome = 'ok' | 'gone' | 'sender' | 'failed';

export function classifyApnsResponse(status: number, body: string): ApnsOutcome {
  if (status === 200) return 'ok';
  let reason = '';
  try {
    reason = String((JSON.parse(body) as { reason?: string }).reason ?? '');
  } catch {
    reason = body;
  }
  if (status === 410) return 'gone';
  if (status === 400 && /BadDeviceToken|DeviceTokenNotForTopic|Unregistered/.test(reason)) return 'gone';
  if (status === 403) return 'sender';
  if (status === 400 && /TopicDisallowed|MissingTopic|BadTopic|InvalidProviderToken/.test(reason)) return 'sender';
  return 'failed';
}

export type ApnsTransport = {
  send(env: ApnsEnv, path: string, headers: Record<string, string>, body: string): Promise<{ status: number; body: string }>;
  close(): Promise<void>;
};

/** 기본 전송 — 환경별 HTTP/2 세션 1개를 발송 동안 재사용. */
export function http2Transport(): ApnsTransport {
  const sessions = new Map<ApnsEnv, ClientHttp2Session>();
  const session = (env: ApnsEnv) => {
    let s = sessions.get(env);
    if (!s || s.closed || s.destroyed) {
      s = connect(HOST[env]);
      s.on('error', (e) => console.warn('[apns] session error', env, (e as Error).message));
      sessions.set(env, s);
    }
    return s;
  };
  return {
    send(env, path, headers, body) {
      return new Promise((resolve, reject) => {
        const req = session(env).request({ ':method': 'POST', ':path': path, ...headers });
        let status = 0;
        const chunks: Buffer[] = [];
        req.setTimeout(10_000, () => {
          req.close(h2c.NGHTTP2_CANCEL);
          reject(new Error('apns timeout'));
        });
        req.on('response', (h) => {
          status = Number(h[':status'] ?? 0);
        });
        req.on('data', (c: Buffer) => chunks.push(c));
        req.on('end', () => resolve({ status, body: Buffer.concat(chunks).toString('utf8') }));
        req.on('error', reject);
        req.end(body);
      });
    },
    async close() {
      for (const s of sessions.values()) s.close();
      sessions.clear();
    },
  };
}

export type ApnsSendResult = { ok: number; gone: number; failed: number; dead: bigint[]; senderKeyMismatch: boolean };

/**
 * `apns:` 구독 일괄 발송. 죽은 토큰 id는 dead로 돌려주고 삭제는 호출부(send.ts dispatch)가 웹푸시와 함께 처리.
 * 발신 키/토픽 오류가 1건이라도 있으면 senderKeyMismatch — 그 배치의 sender 오류는 실패로만 센다.
 */
export async function sendApns(
  subs: { id: bigint; endpoint: string }[],
  payload: PushPayload,
  transport: ApnsTransport = http2Transport(),
): Promise<ApnsSendResult> {
  const out: ApnsSendResult = { ok: 0, gone: 0, failed: 0, dead: [], senderKeyMismatch: false };
  if (subs.length === 0) return out;
  const body = apnsBody(payload);
  const topic = apnsTopic();
  const CHUNK = 150;
  try {
    const jwt = apnsJwt();
    const headers = apnsHeaders(payload, jwt, topic);
    const sendOne = async (s: (typeof subs)[number]) => {
      const parsed = parseApnsEndpoint(s.endpoint);
      if (!parsed) {
        out.gone++;
        out.dead.push(s.id);
        return;
      }
      try {
        const res = await transport.send(parsed.env, `/3/device/${parsed.token}`, headers, body);
        const kind = classifyApnsResponse(res.status, res.body);
        if (kind === 'ok') out.ok++;
        else if (kind === 'gone') {
          out.gone++;
          out.dead.push(s.id);
        } else if (kind === 'sender') {
          out.failed++;
          out.senderKeyMismatch = true;
          console.error('[apns] sender/topic rejected', res.status, res.body.slice(0, 120));
        } else {
          out.failed++;
          console.warn('[apns] send failed', res.status, res.body.slice(0, 80));
        }
      } catch (e) {
        out.failed++;
        console.warn('[apns] send error', (e as Error).message);
      }
    };
    for (let i = 0; i < subs.length; i += CHUNK) {
      await Promise.all(subs.slice(i, i + CHUNK).map(sendOne));
    }
  } finally {
    await transport.close().catch(() => undefined);
  }
  return out;
}
