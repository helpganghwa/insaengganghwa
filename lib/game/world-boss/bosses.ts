/**
 * 월드보스 종류 — 순수 모듈(클라이언트도 가져다 쓴다).
 *
 * 오픈 때는 **한 종류만**(2026-10-08 사용자) — 출현 구역의 지역과 무관한 컨셉이라 어느 땅에 나타나도 같은 보스다.
 * 이름 '잿불의 불사조'·그림 잿불 불사조·배경 불씨가 남은 숲(2026-10-09 확정). 바꾸면 지도·상세·우편·푸시 문구에 그대로 반영된다.
 * 함수는 지역 값을 받는 모양을 유지한다 — 나중에 종류를 늘릴 때 호출부를 고치지 않으려는 것.
 */

/** 보스 이름(2026-10-09 확정). */
export const WORLD_BOSS_NAME = '잿불의 불사조';

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

/**
 * 대기 애니 — 9프레임 가로 띠(256px × 9, WebP). 0번이 정지 그림과 같고, 왕복 재생한다.
 * Pixellab animate_image로 첫 프레임=정지 그림, 몸은 정지하고 날개 끝·불꽃·발밑 재만 움직이게 만들었다.
 */
export function worldBossAnimUrl(_region?: string): string {
  return '/sprites/world-boss/boss__anim.webp';
}

/** 대기 애니 프레임마다 뽑은 불씨 빛(같은 띠 규격) — 띠와 같은 박자로 재생해 맥동이 몸에 붙어 따라간다. */
export function worldBossEmberUrl(_region?: string): string {
  return '/sprites/world-boss/boss__ember.webp';
}

/** 배경에서 뽑은 불씨 빛(배경과 같은 400×240) — 배경 위에 겹쳐 맥동시킨다. */
export function worldBossBgEmberUrl(_region?: string): string {
  return '/sprites/world-boss/bg__ember.png';
}
