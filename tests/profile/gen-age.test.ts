import { describe, expect, it } from 'vitest';

import { generationAgeMin } from '@/lib/game/profile/gen-age';

/**
 * downloading 타임아웃(20분)이 재야 하는 것은 **Pixellab 생성 소요**이지 큐 대기가 아니다.
 * 기준을 created_at으로 두면 대기가 예산을 잠식해, 대기 20분을 넘긴 잡은 발주 직후 첫 폴링에서
 * 즉시 타임아웃 처리된다 — 그 시점엔 Pixellab 과금이 이미 끝나 생성물만 버려진다.
 * 큐가 서지 않던 CBT 실측(478건 전부 대기 0분)에서는 드러나지 않는 결함이라, 동시 생성 상한을
 * 넘는 인원이 몰리는 상황을 여기서 대신 만든다.
 */
const MIN = 60_000;
const TIMEOUT_MIN = 20; // pipeline.ts PROFILE_GEN_TIMEOUT_MIN

const T0 = 1_700_000_000_000; // 잡 생성 시각(고정 — Date.now() 미사용)
const createdAt = new Date(T0);

describe('generationAgeMin — 생성 경과는 큐 대기를 포함하지 않는다', () => {
  it('큐에서 25분 기다린 뒤 5분 생성 → 타임아웃 아님', () => {
    const claimedAt = T0 + 25 * MIN;
    const now = claimedAt + 5 * MIN;
    const age = generationAgeMin({ pixellabClaimedAt: claimedAt }, createdAt, now);
    expect(age).toBe(5);
    expect(age > TIMEOUT_MIN).toBe(false);

    // 옛 산식(created_at 기준)이라면 30분으로 읽혀 즉시 실패·환불했을 자리다.
    expect((now - T0) / MIN).toBe(30);
  });

  it('대기가 예산을 통째로 넘겨도(60분) 갓 발주된 잡은 살아 있다', () => {
    // QUEUED_TIMEOUT_MIN이 60분이라 이만큼의 대기는 설계상 정상이다.
    const claimedAt = T0 + 59 * MIN;
    const age = generationAgeMin({ pixellabClaimedAt: claimedAt }, createdAt, claimedAt + 1000);
    expect(age).toBeCloseTo(1 / 60, 5);
    expect(age > TIMEOUT_MIN).toBe(false);
  });

  it('진짜 stall(생성 25분)은 여전히 잡는다 — 가드가 무뎌지지 않았다', () => {
    const claimedAt = T0 + 3 * MIN;
    const age = generationAgeMin({ pixellabClaimedAt: claimedAt }, createdAt, claimedAt + 25 * MIN);
    expect(age).toBe(25);
    expect(age > TIMEOUT_MIN).toBe(true);
  });

  it('claimedAt 없는 레거시 잡은 created_at 폴백 — 종전 동작 그대로', () => {
    expect(generationAgeMin({ gender: 'male' }, createdAt, T0 + 21 * MIN)).toBe(21);
    expect(generationAgeMin(null, createdAt, T0 + 21 * MIN)).toBe(21);
    expect(generationAgeMin(undefined, createdAt, T0 + 21 * MIN)).toBe(21);
  });

  it('쓰레기 claimedAt(0·NaN·음수·문자열)도 폴백으로 흡수 — 가드가 뚫리지 않는다', () => {
    const now = T0 + 21 * MIN;
    // 이 값들을 그대로 기산점으로 쓰면 age가 거대해지거나(0) 음수가 되어(미래값) 가드가
    // 영영 안 걸리거나 늘 걸린다. 둘 다 escrow 동결/오환불로 이어지므로 폴백이 옳다.
    for (const bad of [0, -1, Number.NaN, 'abc', {}, true]) {
      expect(generationAgeMin({ pixellabClaimedAt: bad }, createdAt, now)).toBe(21);
    }
  });

  it('숫자 문자열 claimedAt은 유효값으로 받는다 — jsonb 왕복 시 문자열이 될 수 있다', () => {
    const claimedAt = T0 + 10 * MIN;
    const age = generationAgeMin({ pixellabClaimedAt: String(claimedAt) }, createdAt, claimedAt + 2 * MIN);
    expect(age).toBe(2);
  });

  it('created_at도 claimedAt도 없으면 epoch 0 기준 — 거대한 age로 반드시 정리된다', () => {
    // escrow가 물린 채 영원히 남는 것보다, 환불하고 재생성하게 하는 쪽이 안전하다.
    expect(generationAgeMin(null, null, T0) > TIMEOUT_MIN).toBe(true);
  });
});
