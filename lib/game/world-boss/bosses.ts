/**
 * 월드보스 종류 — 순수 모듈(클라이언트도 가져다 쓴다).
 *
 * 오픈 때는 **한 종류만**(2026-10-08 사용자) — 출현 구역의 지역과 무관한 컨셉이라 어느 땅에 나타나도 같은 보스다.
 * 이름·그림은 컨셉 작업에서 정한다(자리 표시). 바꾸면 지도·상세·우편·푸시 문구에 그대로 반영된다.
 * 함수는 지역 값을 받는 모양을 유지한다 — 나중에 종류를 늘릴 때 호출부를 고치지 않으려는 것.
 */

/** 자리 표시 이름 — 컨셉 확정 뒤 교체. */
export const WORLD_BOSS_NAME = '대륙의 재앙';

/** 보스 이름(지금은 지역과 무관하게 하나). */
export function worldBossName(_region?: string): string {
  return WORLD_BOSS_NAME;
}

/**
 * 보스 그림 경로 — `public/sprites/world-boss/boss.png`(128px). 지금은 레이드 보스 그림을 복사한 자리 표시 —
 * 전용 그림은 컨셉·이름 확정 뒤 생성해 같은 경로에 덮어쓴다.
 */
export function worldBossSpriteUrl(_region?: string): string {
  return '/sprites/world-boss/boss.png';
}
