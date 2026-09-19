import { describe, expect, it } from 'vitest';

import {
  configuredPixellabKeyIdxs,
  keyIdxFromOptions,
  nextPixellabKeyIdx,
  pickPixellabKeyIdx,
  pixellabKeyByIdx,
  pixellabKeyCount,
  profileGenConcurrency,
} from '@/lib/game/profile/pixellab-keys';
import { PROFILE_GEN_PER_KEY } from '@/lib/game/balance';

/** 키 풀 N개 지원(2026-09-19, key3 추가) — 풀 참여는 env 유무로만, 인덱스는 잡에 영구 기록되는 번호. */
const env = (o: Record<string, string | undefined>) => o as NodeJS.ProcessEnv;
const E1 = env({ PIXELLAB_API_KEY: 'k1' });
const E12 = env({ PIXELLAB_API_KEY: 'k1', PIXELLAB_API_KEY_2: 'k2' });
const E123 = env({ PIXELLAB_API_KEY: 'k1', PIXELLAB_API_KEY_2: 'k2', PIXELLAB_API_KEY_3: 'k3' });
const E13 = env({ PIXELLAB_API_KEY: 'k1', PIXELLAB_API_KEY_3: 'k3' });

describe('Pixellab 키 풀', () => {
  it('설정된 키만 풀에 든다(빈 문자열은 미설정)', () => {
    expect(configuredPixellabKeyIdxs(E1)).toEqual([1]);
    expect(configuredPixellabKeyIdxs(E12)).toEqual([1, 2]);
    expect(configuredPixellabKeyIdxs(E123)).toEqual([1, 2, 3]);
    expect(configuredPixellabKeyIdxs(E13)).toEqual([1, 3]);
    expect(configuredPixellabKeyIdxs(env({ PIXELLAB_API_KEY: 'k1', PIXELLAB_API_KEY_2: ' ' }))).toEqual([1]);
    expect(configuredPixellabKeyIdxs(env({ PIXELLAB_API_KEY_2: 'k2' }))).toEqual([]);
  });

  it('동시 생성 상한 = 키당 상한 × 키 수', () => {
    expect(profileGenConcurrency(E12)).toBe(PROFILE_GEN_PER_KEY * 2);
    expect(profileGenConcurrency(E123)).toBe(PROFILE_GEN_PER_KEY * 3);
    expect(pixellabKeyCount(env({}))).toBe(1);
  });

  it('라운드로빈은 설정된 키 사이를 돈다', () => {
    expect([0, 1, 2, 3, 4, 5].map((s) => pickPixellabKeyIdx(s, E123))).toEqual([1, 2, 3, 1, 2, 3]);
    expect([0, 1, 2, 3].map((s) => pickPixellabKeyIdx(s, E13))).toEqual([1, 3, 1, 3]);
    expect([0, 1, 2].map((s) => pickPixellabKeyIdx(BigInt(s), E1))).toEqual([1, 1, 1]);
  });

  it('다음 키 교대는 순환하고, 모르는 값은 첫 키부터', () => {
    expect(nextPixellabKeyIdx(1, E123)).toBe(2);
    expect(nextPixellabKeyIdx(3, E123)).toBe(1);
    expect(nextPixellabKeyIdx(1, E13)).toBe(3);
    expect(nextPixellabKeyIdx(2, E13)).toBe(1);
    expect(nextPixellabKeyIdx(0, E12)).toBe(1);
    expect(nextPixellabKeyIdx(1, E1)).toBe(1);
  });

  it('키 조회는 인덱스 그대로, 빠진 키는 key1 폴백', () => {
    expect(pixellabKeyByIdx(3, E123)).toBe('k3');
    expect(pixellabKeyByIdx(2, E12)).toBe('k2');
    expect(pixellabKeyByIdx(3, E12)).toBe('k1');
    expect(() => pixellabKeyByIdx(1, env({}))).toThrow('PIXELLAB_API_KEY missing');
  });

  it('잡 options의 키 번호 — 1~3만 인정, 레거시·이상값은 1', () => {
    expect(keyIdxFromOptions({ pixellabKeyIdx: 3 })).toBe(3);
    expect(keyIdxFromOptions({ pixellabKeyIdx: 2 })).toBe(2);
    expect(keyIdxFromOptions({})).toBe(1);
    expect(keyIdxFromOptions(null)).toBe(1);
    expect(keyIdxFromOptions({ pixellabKeyIdx: 4 })).toBe(1);
  });
});
