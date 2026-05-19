import { SPRITE_MANIFEST } from './sprite-manifest';

/**
 * 화면 이동 로딩용 스프라이트 풀(작게 고정) — 전부 프리로드해 즉시 표시.
 * 전체 150종을 프리로드하면 무거우므로 균등 샘플 ~12종만. loading.tsx와
 * SpritePreloader가 **같은 배열**을 써야 캐시 적중(즉시 노출)이 보장된다.
 */
export const LOADING_SPRITES: string[] = Object.values(SPRITE_MANIFEST).filter(
  (_, i) => i % 13 === 0,
);
