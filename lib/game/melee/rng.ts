/**
 * 대난투 결정론 RNG — 시드 문자열(날짜 등) → mulberry32 PRNG.
 * 순수 함수(서버/클라/테스트 동일 결과). MELEE §5 — 동일 입력=동일 배틀 재현.
 */

/** FNV-1a 32bit — 시드 문자열 → 정수 시드. */
function fnv1a(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** mulberry32 — 빠르고 결정적인 32bit PRNG. [0,1) 반환. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 시드 문자열 → [0,1) 난수 생성기. 호출 순서가 곧 시퀀스(결정론). */
export function makeRng(seed: string): () => number {
  return mulberry32(fnv1a(seed));
}
