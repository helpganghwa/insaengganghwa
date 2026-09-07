import { beforeEach, describe, expect, it, vi } from 'vitest';

// dispatch가 endpoint 접두로 웹푸시/APNs를 갈라 보내고 결과·삭제를 합치는지 — 두 발송 경로는 mock.
const sendNotification = vi.fn(async () => undefined);
vi.mock('web-push', () => ({ default: { setVapidDetails: vi.fn(), sendNotification: (...a: unknown[]) => sendNotification(...(a as [])) } }));
const sendApns = vi.fn();
const apnsConfigured = vi.fn(() => true);
vi.mock('@/lib/push/apns', () => ({ sendApns: (...a: unknown[]) => sendApns(...(a as [])), apnsConfigured: () => apnsConfigured() }));
const where = vi.fn(async () => undefined);
const del = vi.fn((..._a: unknown[]) => ({ where }));
vi.mock('@/lib/db/client', () => ({ db: { delete: (...a: unknown[]) => del(...a) } }));

process.env.VAPID_PUBLIC_KEY = 'pub';
process.env.VAPID_PRIVATE_KEY = 'priv';

const { sendPushToSubscriptions } = await import('@/lib/push/send');

const web = (i: number) => ({ id: BigInt(i), endpoint: `https://push.example/${i}`, p256dh: 'k', auth: 'a' });
const ios = (i: number) => ({ id: BigInt(i), endpoint: `apns:production:${'f'.repeat(64)}${i}`, p256dh: 'apns', auth: 'apns' });
const payload = { title: 't', body: 'b', category: 'admin' as const };

beforeEach(() => {
  sendNotification.mockClear();
  sendApns.mockReset();
  apnsConfigured.mockReturnValue(true);
  del.mockClear();
  where.mockClear();
});

describe('push dispatch — 웹푸시/APNs 분기', () => {
  it('접두로 갈라 보내고 집계·죽은 구독 삭제를 합친다', async () => {
    sendApns.mockResolvedValue({ ok: 1, gone: 1, failed: 0, dead: [12n], senderKeyMismatch: false });
    const r = await sendPushToSubscriptions([web(1), web(2), ios(11), ios(12)], payload);
    expect(r).toEqual({ ok: 3, gone: 1, failed: 0 });
    expect(sendNotification).toHaveBeenCalledTimes(2);
    expect(sendApns).toHaveBeenCalledTimes(1);
    expect((sendApns.mock.calls[0] as unknown[])[0]).toEqual([
      { id: 11n, endpoint: ios(11).endpoint },
      { id: 12n, endpoint: ios(12).endpoint },
    ]);
    expect(del).toHaveBeenCalledTimes(1);
  });

  it('APNs 키 미설정이면 iOS 구독은 실패로만 세고 삭제하지 않는다', async () => {
    apnsConfigured.mockReturnValue(false);
    const r = await sendPushToSubscriptions([web(1), ios(11)], payload);
    expect(r).toEqual({ ok: 1, gone: 0, failed: 1 });
    expect(sendApns).not.toHaveBeenCalled();
    expect(del).not.toHaveBeenCalled();
  });

  it('APNs 발신 키 오류는 senderKeyMismatch로 올라온다', async () => {
    sendApns.mockResolvedValue({ ok: 0, gone: 0, failed: 1, dead: [], senderKeyMismatch: true });
    const r = await sendPushToSubscriptions([ios(11)], payload);
    expect(r).toEqual({ ok: 0, gone: 0, failed: 1, senderKeyMismatch: true });
    expect(sendNotification).not.toHaveBeenCalled();
  });
});
