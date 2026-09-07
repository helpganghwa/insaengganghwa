import { afterAll, describe, expect, it } from 'vitest';

import { GET } from '@/app/api/cron/conquest-reveal/route';

/** 정밀 자정 공개 크론 — 인증과 창 밖(정각까지 270초 초과) no-op 분기. DB·공개 로직은 건드리지 않는다. */
const prevSecret = process.env.CRON_SECRET;
process.env.CRON_SECRET = 'test-secret-reveal';

describe('cron/conquest-reveal', () => {
  afterAll(() => {
    process.env.CRON_SECRET = prevSecret;
  });

  it('비밀 없이 호출하면 403', async () => {
    const res = await GET(new Request('http://x/api/cron/conquest-reveal'));
    expect(res.status).toBe(403);
  });

  it('창 밖 호출은 대기·공개 없이 too-early로 즉시 끝난다(자정 5분 전~5분 후가 아닌 시각에서만 의미 있음)', async () => {
    const kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
    const h = kst.getUTCHours();
    const m = kst.getUTCMinutes();
    const inWindow = (h === 23 && m >= 55) || (h === 0 && m < 5);
    if (inWindow) return; // 실제 자정 창에서는 크론 본작업이 돌아 테스트 대상이 아니다
    const t0 = Date.now();
    const res = await GET(new Request('http://x/api/cron/conquest-reveal', { headers: { authorization: 'Bearer test-secret-reveal' } }));
    const body = (await res.json()) as { ok: boolean; skipped?: string; waitMs?: number };
    expect(res.status).toBe(200);
    expect(body.skipped).toBe('too-early');
    expect(body.waitMs).toBeGreaterThan(270_000);
    expect(Date.now() - t0).toBeLessThan(2_000);
  });
});
