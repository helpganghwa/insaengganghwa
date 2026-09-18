import { describe, expect, it } from 'vitest';

import { taxCooldownMsFor, taxReadyAtMs } from '@/lib/game/guild/balance';

/**
 * 세금 수금 쿨다운 72h → 48h 전환(2026-09-18, 소규모 업데이트 8) — 이미 시작된 쿨다운은 끝까지 72h,
 * 적용 시작 이후 시작된 쿨다운부터 48h(사용자: 진행 중인 쿨다운으로 점령전을 계획한 길드 보호).
 */
const H = 3_600_000;
const SINCE = Date.parse('2026-09-20T00:00:00.000Z');

describe('세금 수금 쿨다운 전환', () => {
  it('적용 시작 전에 시작된 쿨다운은 72시간, 이후는 48시간', () => {
    expect(taxCooldownMsFor(SINCE - 1, SINCE)).toBe(72 * H);
    expect(taxCooldownMsFor(SINCE, SINCE)).toBe(48 * H);
    expect(taxCooldownMsFor(SINCE + 5 * H, SINCE)).toBe(48 * H);
  });

  it('배포 직전에 수금한 구역은 72시간 뒤에 열린다(24시간 당겨지지 않는다)', () => {
    const last = SINCE - 2 * H;
    expect(taxReadyAtMs(null, last, SINCE)).toBe(last + 72 * H);
  });

  it('배포 뒤 첫 수금부터는 48시간', () => {
    const last = SINCE + 30 * H;
    expect(taxReadyAtMs(null, last, SINCE)).toBe(last + 48 * H);
  });

  it('습득(72h, 전환 전)과 직전 수금(48h, 전환 후)이 섞이면 늦게 끝나는 쪽이 게이트', () => {
    const captured = SINCE - 10 * H; // 72h → SINCE+62h
    const last = SINCE + 1 * H; // 48h → SINCE+49h
    expect(taxReadyAtMs(captured, last, SINCE)).toBe(captured + 72 * H);
  });

  it('게이트가 없으면 null(즉시 가능)', () => {
    expect(taxReadyAtMs(null, null, SINCE)).toBeNull();
  });
});
