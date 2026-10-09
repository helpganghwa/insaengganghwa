/**
 * 월드보스 종류 — 순수 모듈(클라이언트도 가져다 쓴다).
 *
 * 오픈 때는 **한 종류만**(2026-10-08 사용자) — 출현 구역의 지역과 무관한 컨셉이라 어느 땅에 나타나도 같은 보스다.
 * 그림은 잿불 불사조·배경은 불씨가 남은 숲(2026-10-09 확정), 이름은 아직 자리 표시다. 바꾸면 지도·상세·우편·푸시 문구에 그대로 반영된다.
 * 함수는 지역 값을 받는 모양을 유지한다 — 나중에 종류를 늘릴 때 호출부를 고치지 않으려는 것.
 */

/** 자리 표시 이름 — 컨셉 확정 뒤 교체. */
export const WORLD_BOSS_NAME = '대륙의 재앙';

/** 보스 이름(지금은 지역과 무관하게 하나). */
export function worldBossName(_region?: string): string {
  return WORLD_BOSS_NAME;
}

/** 보스 그림 경로 — `public/sprites/world-boss/boss.png`(256px, 잿불 불사조 정면). */
export function worldBossSpriteUrl(_region?: string): string {
  return '/sprites/world-boss/boss.png';
}

/** 보스 배경 — `public/sprites/world-boss/bg.png`(400×240, 불씨가 남은 숲). 어느 구역에 나타나도 같은 무대다. */
export function worldBossBgUrl(_region?: string): string {
  return '/sprites/world-boss/bg.png';
}
