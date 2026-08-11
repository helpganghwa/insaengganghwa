import { afterEach, describe, expect, it, vi } from 'vitest';

import { postAlertWebhook } from '@/lib/ops/alert-webhook';

/**
 * 경보 웹훅 계약 — env 조합별 동작 고정. fetch를 가로채므로 실제 발송·외부 의존 없음.
 * 특히 **env 미설정 시 기존과 완전히 동일**해야 한다(채널을 안 붙인 배포에서도 경보 본작업이
 * 깨지면 안 된다). 멘션 선행 공백·undefined 혼입 같은 문자열 조립 실수도 여기서 잡는다.
 */
const ORIG_URL = process.env.PAYMENT_ALERT_WEBHOOK_URL;
const ORIG_MENTION = process.env.PAYMENT_ALERT_WEBHOOK_MENTION;

afterEach(() => {
  vi.restoreAllMocks();
  if (ORIG_URL === undefined) delete process.env.PAYMENT_ALERT_WEBHOOK_URL;
  else process.env.PAYMENT_ALERT_WEBHOOK_URL = ORIG_URL;
  if (ORIG_MENTION === undefined) delete process.env.PAYMENT_ALERT_WEBHOOK_MENTION;
  else process.env.PAYMENT_ALERT_WEBHOOK_MENTION = ORIG_MENTION;
});

const spyFetch = () => vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 204 }));
const sentBody = (spy: ReturnType<typeof spyFetch>) =>
  JSON.parse(String((spy.mock.calls[0]![1] as RequestInit).body)) as { content: string; text: string };

describe('경보 웹훅 계약', () => {
  it('URL 미설정 — 발송하지 않고 예외도 없다(배포 전 상태와 동일)', async () => {
    delete process.env.PAYMENT_ALERT_WEBHOOK_URL;
    const spy = spyFetch();
    await expect(postAlertWebhook('x', { mention: true })).resolves.toBeUndefined();
    expect(spy).not.toHaveBeenCalled();
  });

  it('MENTION 미설정 — 멘션 요청이어도 본문이 그대로(선행 공백·undefined 없음)', async () => {
    process.env.PAYMENT_ALERT_WEBHOOK_URL = 'https://example.invalid/hook';
    delete process.env.PAYMENT_ALERT_WEBHOOK_MENTION;
    const spy = spyFetch();
    await postAlertWebhook('본문', { mention: true });
    expect(sentBody(spy).content).toBe('본문');
  });

  it('MENTION 설정 + mention=false — 붙지 않는다', async () => {
    process.env.PAYMENT_ALERT_WEBHOOK_URL = 'https://example.invalid/hook';
    process.env.PAYMENT_ALERT_WEBHOOK_MENTION = '<@1>';
    const spy = spyFetch();
    await postAlertWebhook('본문', { mention: false });
    expect(sentBody(spy).content).toBe('본문');
  });

  it('MENTION 설정 + mention=true — 맨 앞에 한 칸 띄고 붙는다', async () => {
    process.env.PAYMENT_ALERT_WEBHOOK_URL = 'https://example.invalid/hook';
    process.env.PAYMENT_ALERT_WEBHOOK_MENTION = '<@1>';
    const spy = spyFetch();
    await postAlertWebhook('본문', { mention: true });
    const b = sentBody(spy);
    expect(b.content).toBe('<@1> 본문');
    expect(b.text).toBe('<@1> 본문'); // Slack 필드도 동일
  });

  it('MENTION 이 공백뿐 — 붙지 않는다', async () => {
    process.env.PAYMENT_ALERT_WEBHOOK_URL = 'https://example.invalid/hook';
    process.env.PAYMENT_ALERT_WEBHOOK_MENTION = '   ';
    const spy = spyFetch();
    await postAlertWebhook('본문', { mention: true });
    expect(sentBody(spy).content).toBe('본문');
  });

  it('발송 실패해도 예외를 던지지 않는다(경보가 본작업을 막으면 안 됨)', async () => {
    process.env.PAYMENT_ALERT_WEBHOOK_URL = 'https://example.invalid/hook';
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network down'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(postAlertWebhook('본문', { mention: true })).resolves.toBeUndefined();
  });

  it('404 응답 — 던지지 않되 상태 코드를 로그로 남긴다(웹훅 삭제·채널 이동을 무성으로 넘기지 않음)', async () => {
    process.env.PAYMENT_ALERT_WEBHOOK_URL = 'https://example.invalid/hook';
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('unknown webhook', { status: 404 }));
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(postAlertWebhook('본문', { mention: true })).resolves.toBeUndefined();
    expect(err).toHaveBeenCalled();
    expect(err.mock.calls[0]!.join(' ')).toContain('404');
  });
});
