import { beforeEach, describe, expect, it, vi } from 'vitest';

// 발신 키 불일치 보호 장치(2026-09-03 사고) — 배치 대부분이 403이면 구독을 지우지 않는다.
const sendNotification = vi.fn();
vi.mock('web-push', () => ({ default: { setVapidDetails: vi.fn(), sendNotification: (...a: unknown[]) => sendNotification(...a) } }));
const where = vi.fn(async () => undefined);
const del = vi.fn((..._a: unknown[]) => ({ where }));
vi.mock('@/lib/db/client', () => ({ db: { delete: (...a: unknown[]) => del(...a) } }));

process.env.VAPID_PUBLIC_KEY = 'pub';
process.env.VAPID_PRIVATE_KEY = 'priv';

const { sendPushToSubscriptions } = await import('@/lib/push/send');

const sub = (i: number) => ({ id: BigInt(i), endpoint: `https://push.example/${i}`, p256dh: 'k', auth: 'a' });
const err = (statusCode: number, body = '') => Object.assign(new Error('push'), { statusCode, body });
const payload = { title: 't', body: 'b', category: 'admin' as const };

beforeEach(() => {
  sendNotification.mockReset();
  del.mockClear();
  where.mockClear();
});

describe('push send — VAPID 불일치 보호 장치', () => {
  it('배치 전체가 403이면 발신 키 문제로 보고 삭제하지 않는다', async () => {
    sendNotification.mockRejectedValue(err(403));
    const r = await sendPushToSubscriptions([1, 2, 3, 4, 5].map(sub), payload);
    expect(r).toEqual({ ok: 0, gone: 0, failed: 5, senderKeyMismatch: true });
    expect(del).not.toHaveBeenCalled();
  });

  it('소수 불일치는 종전대로 죽은 구독으로 삭제한다', async () => {
    sendNotification.mockImplementation(async (s: { endpoint: string }) => {
      if (s.endpoint.endsWith('/2')) throw err(403);
    });
    const r = await sendPushToSubscriptions([1, 2, 3, 4, 5].map(sub), payload);
    expect(r).toEqual({ ok: 4, gone: 1, failed: 0 });
    expect(del).toHaveBeenCalledTimes(1);
  });

  it('보호 장치가 걸려도 404/410은 삭제한다', async () => {
    sendNotification.mockImplementation(async (s: { endpoint: string }) => {
      if (s.endpoint.endsWith('/5')) throw err(410);
      if (s.endpoint.endsWith('/4')) return;
      throw err(403);
    });
    const r = await sendPushToSubscriptions([1, 2, 3, 4, 5].map(sub), payload);
    expect(r).toEqual({ ok: 1, gone: 1, failed: 3, senderKeyMismatch: true });
    expect(del).toHaveBeenCalledTimes(1);
  });

  it('Apple의 400 VapidPkHashMismatch도 불일치로 센다', async () => {
    sendNotification.mockRejectedValue(err(400, '{"reason":"VapidPkHashMismatch"}'));
    const r = await sendPushToSubscriptions([1, 2, 3].map(sub), payload);
    expect(r.senderKeyMismatch).toBe(true);
    expect(del).not.toHaveBeenCalled();
  });
});
